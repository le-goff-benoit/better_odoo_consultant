import asyncio
import json
import httpx
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...core.models import Profile
from ...services.keyring_service import store_secret, get_secret, delete_secret
from ...services.profile_manager import get_profile_api_key
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


class ChatRequest(BaseModel):
    provider: str
    profile_id: Optional[int] = None   # None → general mode
    company_id: Optional[int] = None   # restrict queries to this company
    version: Optional[str] = None      # Odoo version for general mode
    messages: list[ChatMessage]
    model: Optional[str] = None


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
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    # Load user profile for personalisation
    from ..routes.settings import USER_PROFILE_FILE
    _user_profile: dict = {}
    try:
        if USER_PROFILE_FILE.exists():
            import json as _json
            _user_profile = _json.loads(USER_PROFILE_FILE.read_text())
    except Exception:
        pass

    # ── General mode (no profile) ──────────────────────────────────
    if req.profile_id is None:
        version = req.version or "?"
        source_path: Optional[str] = None
        candidate = _os.path.expanduser(f"~/odoo-sources/{version}")
        if _os.path.isdir(candidate):
            source_path = candidate
        context_md = load_context_for_prompt(version)

        async def generate_general():
            try:
                async for evt in stream_chat(req.provider, api_key, req.model, None, None, messages, source_path, context_md, version, _user_profile):
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

    odoo_key = get_profile_api_key(profile.name)
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

    odoo = OdooClient(profile.db_url, profile.db_name, profile.login, odoo_key, company_id=active_company_id)

    source_path = None
    _version_to_use = profile.odoo_version
    candidate = _os.path.expanduser(f"~/odoo-sources/{_version_to_use}") if _version_to_use else ""
    if _version_to_use and _os.path.isdir(candidate):
        source_path = candidate
    elif not source_path:
        # Fallback : chercher la version la plus récente installée
        sources_base = _os.path.expanduser("~/odoo-sources")
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

    context_md = load_context_for_prompt(_version_to_use)

    async def generate():
        try:
            async for evt in stream_chat(req.provider, api_key, req.model, odoo, profile, messages, source_path, context_md, _version_to_use, _user_profile, _active_company_name):
                yield _sse(evt)
        except Exception as exc:
            yield _sse({"type": "error", "msg": str(exc)})
        yield _sse({"type": "end"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
