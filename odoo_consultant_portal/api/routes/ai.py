import asyncio
import base64
import io
import json
import httpx
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...core.models import Profile
from ...services.keyring_service import store_secret, get_secret, delete_secret
from ...services.profile_manager import get_profile_api_key  # kept for copilot/legacy use
from ...services.odoo_client import OdooClient
from ...services.ai_service import (
    stream_chat, DEFAULT_MODELS,
    GITHUB_MODELS_BASE_URL, COPILOT_BASE_URL, COPILOT_HEADERS,
)
from ...services.context_service import load_context_for_prompt

router = APIRouter()

_PROVIDERS = ("claude", "openai", "gemini", "github", "copilot")
_KEY_PREFIX = "ai_key:"

# GitHub Device Flow — VS Code Copilot client_id (public)
_COPILOT_CLIENT_ID  = "Iv1.b507a08c87ecfe98"
_GH_DEVICE_URL      = "https://github.com/login/device/code"
_GH_TOKEN_URL       = "https://github.com/login/oauth/access_token"
_COPILOT_TOKEN_URL  = "https://api.github.com/copilot_internal/v2/token"
_COPILOT_TOKEN_HDRS = {
    "editor-version":         "vscode/1.95.0",
    "editor-plugin-version":  "copilot-chat/0.22.4",
    "user-agent":             "GithubCopilot/1.155.0",
    "copilot-integration-id": "vscode-chat",
}


def _ai_key(provider: str) -> Optional[str]:
    return get_secret(f"{_KEY_PREFIX}{provider}")


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _exchange_copilot_token(oauth_token: str) -> str:
    """Exchange a stored GitHub OAuth token for a short-lived Copilot bearer token."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            _COPILOT_TOKEN_URL,
            headers={**_COPILOT_TOKEN_HDRS, "Authorization": f"token {oauth_token}"},
        )
        resp.raise_for_status()
        return resp.json()["token"]


# ── Settings ─────────────────────────────────────────────────────

_MODEL_CONFIG_PATH = Path.home() / ".odoo-consultant" / "model-config.json"


def _read_model_config() -> dict:
    if _MODEL_CONFIG_PATH.exists():
        try:
            return json.loads(_MODEL_CONFIG_PATH.read_text())
        except Exception:
            pass
    return {}


def _write_model_config(config: dict) -> None:
    _MODEL_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _MODEL_CONFIG_PATH.write_text(json.dumps(config, indent=2))


@router.get("/model-config")
async def get_model_config():
    return _read_model_config()


@router.post("/model-config")
async def save_model_config(config: dict):
    _write_model_config(config)
    return {"ok": True}


@router.get("/providers")
async def list_providers():
    return {p: bool(_ai_key(p)) for p in _PROVIDERS}


class KeyBody(BaseModel):
    provider: str
    key: str


@router.post("/key")
async def save_key(body: KeyBody):
    if body.provider not in _PROVIDERS:
        raise HTTPException(400, f"Fournisseur inconnu : {body.provider}")
    store_secret(f"{_KEY_PREFIX}{body.provider}", body.key.strip())
    return {"ok": True}


@router.delete("/key/{provider}")
async def delete_key(provider: str):
    if provider not in _PROVIDERS:
        raise HTTPException(400, f"Fournisseur inconnu : {provider}")
    delete_secret(f"{_KEY_PREFIX}{provider}")
    return {"ok": True}


class TestKeyBody(BaseModel):
    provider: str


@router.post("/test-key")
async def test_key(body: TestKeyBody):
    """Ping the AI provider with a minimal request to verify the key."""
    if body.provider not in _PROVIDERS:
        raise HTTPException(400, f"Fournisseur inconnu : {body.provider}")
    api_key = _ai_key(body.provider)
    if not api_key:
        raise HTTPException(400, "Clé non configurée")

    loop = asyncio.get_event_loop()
    try:
        if body.provider == "claude":
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            await loop.run_in_executor(None, lambda: client.messages.create(
                model="claude-haiku-4-5-20251001", max_tokens=5,
                messages=[{"role": "user", "content": "Hi"}],
            ))

        elif body.provider in ("openai", "github"):
            import openai as _oai
            kwargs: dict = {"api_key": api_key}
            if body.provider == "github":
                kwargs["base_url"] = GITHUB_MODELS_BASE_URL
            client = _oai.OpenAI(**kwargs)
            await loop.run_in_executor(None, lambda: client.chat.completions.create(
                model="gpt-4o-mini", max_tokens=5,
                messages=[{"role": "user", "content": "Hi"}],
            ))

        elif body.provider == "copilot":
            import openai as _oai
            copilot_token = await _exchange_copilot_token(api_key)
            client = _oai.OpenAI(
                api_key=copilot_token,
                base_url=COPILOT_BASE_URL,
                default_headers=COPILOT_HEADERS,
            )
            await loop.run_in_executor(None, lambda: client.chat.completions.create(
                model="gpt-4o", max_tokens=5,
                messages=[{"role": "user", "content": "Hi"}],
            ))

        elif body.provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            mdl = genai.GenerativeModel("gemini-1.5-flash")
            await loop.run_in_executor(None, lambda: mdl.generate_content("Hi"))

        return {"ok": True, "msg": "Connexion réussie ✓"}
    except Exception as exc:
        msg = str(exc)
        if "401" in msg or "authentication" in msg.lower() or "unauthorized" in msg.lower():
            msg = "Clé invalide ou expirée (401)"
        elif "403" in msg or "forbidden" in msg.lower():
            msg = "Accès refusé — abonnement Copilot requis (403)"
        elif "429" in msg:
            msg = "Quota dépassé — réessayez dans quelques secondes (429)"
        return {"ok": False, "msg": msg}


# ── GitHub Copilot OAuth Device Flow ─────────────────────────────

@router.post("/copilot/login")
async def copilot_login():
    """Start GitHub Device Flow — returns user_code to show to the user."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _GH_DEVICE_URL,
            headers={"Accept": "application/json"},
            data={"client_id": _COPILOT_CLIENT_ID, "scope": "read:user"},
        )
        data = resp.json()
    if "error" in data:
        raise HTTPException(400, data.get("error_description", data["error"]))
    return {
        "device_code":      data["device_code"],
        "user_code":        data["user_code"],
        "verification_uri": data["verification_uri"],
        "interval":         data.get("interval", 5),
        "expires_in":       data.get("expires_in", 900),
    }


class PollBody(BaseModel):
    device_code: str


@router.post("/copilot/poll")
async def copilot_poll(body: PollBody):
    """Poll GitHub to check if the user has authorized. Returns status."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _GH_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id":  _COPILOT_CLIENT_ID,
                "device_code": body.device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
        data = resp.json()

    if "error" in data:
        # "authorization_pending" | "slow_down" | "expired_token" | "access_denied"
        return {"status": data["error"]}

    oauth_token = data["access_token"]
    store_secret(f"{_KEY_PREFIX}copilot", oauth_token)
    return {"status": "ok"}


# ── Chat ─────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatAttachment(BaseModel):
    name: str
    mime_type: str = ""
    size: int
    kind: str  # "text" | "pdf"
    text: Optional[str] = None
    content_base64: Optional[str] = None


class ChatRequest(BaseModel):
    provider: str
    profile_id: Optional[int] = None   # None → general mode
    company_id: Optional[int] = None   # restrict queries to this company
    active_env_id: Optional[str] = None  # per-conversation env override
    version: Optional[str] = None      # Odoo version for general mode / migration source
    messages: list[ChatMessage]
    attachments: list[ChatAttachment] = Field(default_factory=list)
    model: Optional[str] = None
    # Migration mode
    migration_mode: bool = False
    target_version: Optional[str] = None      # standalone target version
    target_profile_id: Optional[int] = None   # target from a project environment
    target_env_id: Optional[str] = None
    # Reasoning perspective: "technical" (default) or "functional"
    perspective: Optional[str] = "technical"


_ATTACHMENT_MAX_FILES = 5
_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
_ATTACHMENT_MAX_CHARS = 40_000
_TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".xml", ".py", ".log"}


def _attachment_ext(name: str) -> str:
    return Path(name or "").suffix.lower()


def _trim_attachment_text(text: str, remaining: int) -> tuple[str, int]:
    if remaining <= 0:
        return "", 0
    if len(text) <= remaining:
        return text, remaining - len(text)
    suffix = "\n\n[...pièce jointe tronquée pour limiter la taille du prompt...]"
    usable = max(0, remaining - len(suffix))
    return text[:usable] + suffix, 0


def _extract_pdf_attachment(att: ChatAttachment) -> str:
    if not att.content_base64:
        raise HTTPException(400, f"PDF '{att.name}' vide ou illisible")
    try:
        raw = base64.b64decode(att.content_base64, validate=True)
    except Exception:
        raise HTTPException(400, f"PDF '{att.name}' invalide (base64)")
    if len(raw) > _ATTACHMENT_MAX_BYTES:
        raise HTTPException(400, f"'{att.name}' dépasse la limite de 5 MB")
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        pages = []
        for idx, page in enumerate(reader.pages, start=1):
            page_text = (page.extract_text() or "").strip()
            if page_text:
                pages.append(f"### Page {idx}\n{page_text}")
    except Exception as exc:
        raise HTTPException(400, f"Impossible d'extraire le PDF '{att.name}' : {exc}")
    text = "\n\n".join(pages).strip()
    if not text:
        raise HTTPException(400, f"PDF '{att.name}' sans texte extractible (OCR non supporté en v1)")
    return text


def _attachments_markdown(attachments: list[ChatAttachment]) -> str:
    if not attachments:
        return ""
    if len(attachments) > _ATTACHMENT_MAX_FILES:
        raise HTTPException(400, f"Maximum {_ATTACHMENT_MAX_FILES} fichiers par message")

    sections: list[str] = []
    remaining = _ATTACHMENT_MAX_CHARS
    for att in attachments:
        if att.size > _ATTACHMENT_MAX_BYTES:
            raise HTTPException(400, f"'{att.name}' dépasse la limite de 5 MB")
        ext = _attachment_ext(att.name)
        if att.kind == "pdf":
            if ext != ".pdf":
                raise HTTPException(400, f"'{att.name}' n'est pas un PDF valide")
            raw_text = _extract_pdf_attachment(att)
        elif att.kind == "text":
            if ext not in _TEXT_EXTENSIONS:
                raise HTTPException(400, f"Format non supporté pour '{att.name}'")
            raw_text = (att.text or "").strip()
            if not raw_text:
                raise HTTPException(400, f"'{att.name}' ne contient pas de texte exploitable")
        else:
            raise HTTPException(400, f"Type de pièce jointe inconnu pour '{att.name}'")

        text, remaining = _trim_attachment_text(raw_text, remaining)
        if not text:
            break
        sections.append(
            f"## Pièce jointe: {att.name}\n"
            f"- Type: {att.mime_type or att.kind}\n"
            f"- Taille: {att.size} octets\n\n"
            f"{text}"
        )
    if not sections:
        return ""
    return "\n\n---\n\n".join(sections)


def _inject_attachments(messages: list[dict], attachments: list[ChatAttachment]) -> list[dict]:
    md = _attachments_markdown(attachments)
    if not md:
        return messages
    if not messages or messages[-1].get("role") != "user":
        raise HTTPException(400, "Les pièces jointes doivent être associées à un message utilisateur")
    patched = list(messages)
    patched[-1] = {
        **patched[-1],
        "content": (
            f"{patched[-1].get('content', '').strip()}"
            "\n\n---\n\n"
            "Utilise les pièces jointes suivantes pour répondre à la demande. "
            "Ne les mentionne que si c'est utile.\n\n"
            f"{md}"
        ).strip(),
    }
    return patched


@router.post("/chat")
async def chat(req: ChatRequest, session: AsyncSession = Depends(get_session)):
    if req.provider not in _PROVIDERS:
        raise HTTPException(400, f"Fournisseur inconnu : {req.provider}")

    api_key = _ai_key(req.provider)
    if not api_key:
        raise HTTPException(400, f"Clé API '{req.provider}' non configurée — ajoutez-la dans les Paramètres.")

    # For Copilot, exchange the stored OAuth token for a short-lived bearer token
    if req.provider == "copilot":
        try:
            api_key = await _exchange_copilot_token(api_key)
        except Exception as exc:
            raise HTTPException(400, f"Impossible d'obtenir le token Copilot : {exc}")

    import os as _os
    user_prompt = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    messages = _inject_attachments(messages, req.attachments)

    # Load user profile for personalisation
    from ..routes.settings import USER_PROFILE_FILE
    _user_profile: dict = {}
    try:
        if USER_PROFILE_FILE.exists():
            import json as _json
            _user_profile = _json.loads(USER_PROFILE_FILE.read_text())
    except Exception:
        pass
    _context_locale = (_user_profile.get("contextLanguage") or _user_profile.get("language") or "fr")
    _response_language = (_user_profile.get("assistantLanguage") or "auto")

    # ── General / Migration mode (no profile) ─────────────────────
    if req.profile_id is None:
        version = req.version or "?"
        source_path: Optional[str] = None
        candidate = str(Path.home() / ".odoo-consultant" / "sources" / version)
        if _os.path.isdir(candidate):
            source_path = candidate
        context_md = load_context_for_prompt(
            version,
            migration=req.migration_mode,
            user_prompt=user_prompt,
            perspective=req.perspective or "technical",
            locale=_context_locale,
        )

        # Migration target resolution
        _gen_target_path = None
        _gen_target_ver = req.target_version
        if req.migration_mode and _gen_target_ver:
            _tgt_c = str(Path.home() / ".odoo-consultant" / "sources" / _gen_target_ver)
            if _os.path.isdir(_tgt_c):
                _gen_target_path = _tgt_c

        async def generate_general():
            try:
                async for evt in stream_chat(req.provider, api_key, req.model, None, None, messages, source_path, context_md, version, _user_profile, None, None, _gen_target_path, req.migration_mode, _gen_target_ver, req.perspective or "technical", _response_language):
                    yield _sse(evt)
            except Exception as exc:
                yield _sse({"type": "error", "msg": str(exc)})
            yield _sse({"type": "end"})

        return StreamingResponse(
            generate_general(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ── Project mode (with profile) ────────────────────────────────
    profile = await session.get(Profile, req.profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")

    from ...services.profile_manager import get_active_env_from_json, get_active_api_key
    _fallback = {"db_url": profile.db_url, "db_name": profile.db_name, "login": profile.login, "odoo_version": profile.odoo_version}
    _active_env = get_active_env_from_json(profile.environments, req.active_env_id or profile.active_env_id, _fallback)
    odoo_key = get_active_api_key(profile.name, _active_env.get("id", "prod"))
    if not odoo_key:
        raise HTTPException(400, "Clé API Odoo introuvable pour ce projet")

    active_company_id = req.company_id or profile.selected_company_id or None

    # Resolve company name for the system prompt
    _active_company_name: Optional[str] = None
    if active_company_id and profile.company_ids:
        import json as _json2
        try:
            for c in _json2.loads(profile.company_ids):
                if c.get("id") == active_company_id:
                    _active_company_name = c.get("name")
                    break
        except Exception:
            pass

    odoo = OdooClient(
        _active_env.get("db_url") or profile.db_url,
        _active_env.get("db_name") or profile.db_name,
        _active_env.get("login") or profile.login,
        odoo_key, company_id=active_company_id
    )

    source_path = None
    _version_to_use = _active_env.get("odoo_version") or profile.odoo_version
    candidate = str(Path.home() / ".odoo-consultant" / "sources" / _version_to_use) if _version_to_use else ""
    if _version_to_use and _os.path.isdir(candidate):
        source_path = candidate
    elif not source_path:
        # Fallback : chercher la version la plus récente installée
        sources_base = str(Path.home() / ".odoo-consultant" / "sources")
        if _os.path.isdir(sources_base):
            import re as _re
            _ver_re = _re.compile(r'^\d+\.\d+$')
            available = sorted(
                [d for d in _os.listdir(sources_base) if _ver_re.match(d) and _os.path.isdir(_os.path.join(sources_base, d))],
                reverse=True
            )
            if available:
                source_path = _os.path.join(sources_base, available[0])
                if not _version_to_use:
                    _version_to_use = available[0]

    # Detect per-environment cloned repo
    repo_path = None
    _env_github_repo = _active_env.get("github_repo")
    if _env_github_repo:
        from pathlib import Path as _Path
        _repo_local = _Path.home() / ".odoo-consultant" / "repos" / profile.name / _active_env.get("id", "prod")
        if _repo_local.is_dir() and (_repo_local / ".git").exists():
            repo_path = str(_repo_local)

    # Resolve migration target path
    target_path = None
    _target_version = req.target_version
    if req.migration_mode:
        if _target_version:
            _tgt_candidate = str(Path.home() / ".odoo-consultant" / "sources" / _target_version)
            if _os.path.isdir(_tgt_candidate):
                target_path = _tgt_candidate
        elif req.target_profile_id:
            _tgt_profile = await session.get(Profile, req.target_profile_id)
            if _tgt_profile:
                from ...services.profile_manager import get_active_env_from_json as _gaej
                _tgt_fallback = {"odoo_version": _tgt_profile.odoo_version}
                _tgt_env = _gaej(_tgt_profile.environments, req.target_env_id or _tgt_profile.active_env_id, _tgt_fallback)
                _tgt_ver = _tgt_env.get("odoo_version") or _tgt_profile.odoo_version
                if _tgt_ver:
                    _target_version = _tgt_ver
                    _tgt_c = str(Path.home() / ".odoo-consultant" / "sources" / _tgt_ver)
                    if _os.path.isdir(_tgt_c):
                        target_path = _tgt_c

    context_md = load_context_for_prompt(
        _version_to_use,
        migration=req.migration_mode,
        user_prompt=user_prompt,
        perspective=req.perspective or "technical",
        locale=_context_locale,
    )

    async def generate():
        try:
            async for evt in stream_chat(req.provider, api_key, req.model, odoo, profile, messages, source_path, context_md, _version_to_use, _user_profile, _active_company_name, repo_path, target_path, req.migration_mode, _target_version, req.perspective or "technical", _response_language):
                yield _sse(evt)
        except Exception as exc:
            yield _sse({"type": "error", "msg": str(exc)})
        yield _sse({"type": "end"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
