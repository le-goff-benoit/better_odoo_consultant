import asyncio
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
from ...services.context_service import load_context_for_prompt, complexity_profile_block, last_selected_skill_names
from ...services.localization_service import active_company_from_cache, build_localization_context
from ...services.technical_complexity_service import build_technical_complexity_context, complexity_mode_from_raw
from ...services.attachment_service import ChatAttachment, inject_attachments
from ...skills.registry import (
    skill_catalog, skill_names, skill_diagram, skill_by_name,
    read_skill_reference, read_skill_template, read_skill_example,
)

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
_TOOL_CONFIG_PATH  = Path.home() / ".odoo-consultant" / "tool-config.json"


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


def _read_tool_config() -> dict:
    if _TOOL_CONFIG_PATH.exists():
        try:
            return json.loads(_TOOL_CONFIG_PATH.read_text())
        except Exception:
            pass
    return {"disabled_tools": []}


def _write_tool_config(config: dict) -> None:
    _TOOL_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _TOOL_CONFIG_PATH.write_text(json.dumps(config, indent=2))


@router.get("/tool-config")
async def get_tool_config():
    return _read_tool_config()


@router.get("/skills")
async def get_skills():
    return {"skills": skill_catalog()}


@router.get("/skills/{name}/diagram")
async def get_skill_diagram(name: str):
    diagram = skill_diagram(name)
    if diagram is None:
        skill = skill_by_name(name)
        if skill is None:
            raise HTTPException(404, "Skill inconnu")
        raise HTTPException(404, "Aucun diagramme défini pour ce skill")
    skill = skill_by_name(name)
    return {
        "name": name,
        "label": skill.label if skill else name,
        "label_en": skill.label_en if skill else name,
        "kind": skill.kind if skill else "tool",
        "builtin": skill.builtin if skill else False,
        "group": skill.group if skill else "live",
        "diagram": diagram,
    }


@router.get("/skills/{name}/reference/{filename}")
async def get_skill_reference(name: str, filename: str):
    content = read_skill_reference(name, filename)
    if content is None:
        raise HTTPException(404, "Référence introuvable")
    return {"name": name, "filename": filename, "content": content}


@router.get("/skills/{name}/template/{filename}")
async def get_skill_template(name: str, filename: str):
    content = read_skill_template(name, filename)
    if content is None:
        raise HTTPException(404, "Template introuvable")
    return {"name": name, "filename": filename, "content": content}


@router.get("/skills/{name}/example/{filename}")
async def get_skill_example(name: str, filename: str):
    content = read_skill_example(name, filename)
    if content is None:
        raise HTTPException(404, "Exemple introuvable")
    return {"name": name, "filename": filename, "content": content}


@router.post("/tool-config")
async def save_tool_config(config: dict):
    # Accept both legacy "disabled_tools" and unified "disabled_skills" payloads.
    disabled = config.get("disabled_skills", config.get("disabled_tools", []))
    if not isinstance(disabled, list):
        raise HTTPException(400, "disabled_skills doit être une liste")
    known = skill_names()
    cleaned = [name for name in dict.fromkeys(disabled) if isinstance(name, str) and name in known]
    _write_tool_config({"disabled_tools": cleaned})
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
    active_env_id: Optional[str] = None  # per-conversation env override
    version: Optional[str] = None      # Odoo version for general mode / migration source
    messages: list[ChatMessage]
    attachments: list[ChatAttachment] = Field(default_factory=list)
    model: Optional[str] = None
    country_code: Optional[str] = None  # general mode fiscal localization selector
    # Migration mode
    migration_mode: bool = False
    target_version: Optional[str] = None      # standalone target version
    target_profile_id: Optional[int] = None   # target from a project environment
    target_env_id: Optional[str] = None
    # Reasoning perspective: "support" | "business_analyst" | "architect" | "developer".
    # Legacy values "technical" / "functional" are still accepted and mapped
    # downstream to "developer" / "business_analyst".
    perspective: Optional[str] = "developer"
    # Skills (tools) explicitement désactivés par l'utilisateur
    disabled_tools: list[str] = Field(default_factory=list)


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
    # Context routing (skills / domain / localization) is keyword-based — feed it
    # the last 3 user turns so a short follow-up keeps its conversation domain.
    user_prompt = "\n".join([m.content for m in req.messages if m.role == "user"][-3:])
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    messages = inject_attachments(messages, req.attachments)

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

    # Core-skill gating: a single ``disabled_tools`` list now carries both tool
    # and core skill names; the chat handler short-circuits a few core skills
    # before assembly (perspective_router, context_aggregator, localization_detector,
    # complexity_analyzer). Sub-skills consumed inside context_service are gated
    # inside that module (release_notes_injector, skill_dispatcher).
    _disabled_skills = set(req.disabled_tools or [])
    _perspective_active = "perspective_router" not in _disabled_skills
    _aggregator_active = "context_aggregator" not in _disabled_skills
    _localization_active = "localization_detector" not in _disabled_skills
    _complexity_active = "complexity_analyzer" not in _disabled_skills
    # Effective perspective: when the router is disabled, fall back to a neutral
    # developer baseline so no role bias leaks into the prompt.
    _effective_perspective = (req.perspective or "developer") if _perspective_active else "developer"

    # ── General / Migration mode (no profile) ─────────────────────
    if req.profile_id is None:
        version = req.version or "?"
        _gen_target_ver = req.target_version
        source_path: Optional[str] = None
        _src_base = Path.home() / ".odoo-consultant" / "sources"
        candidate = str(_src_base / version)
        if _os.path.isdir(candidate):
            source_path = candidate
        elif _os.path.isdir(str(_src_base / f"{version}-enterprise")):
            source_path = str(_src_base / f"{version}-enterprise")
        context_md = "" if not _aggregator_active else load_context_for_prompt(
            version,
            target_version=_gen_target_ver,
            migration=req.migration_mode,
            user_prompt=user_prompt,
            perspective=_effective_perspective,
            locale=_context_locale,
            country_code=req.country_code if _localization_active else None,
            force_localization=bool(req.country_code) and _localization_active,
            disabled_tools=req.disabled_tools,
        )
        _selected_skills = last_selected_skill_names() if _aggregator_active else []

        # Migration target resolution
        _gen_target_path = None
        if req.migration_mode and _gen_target_ver:
            _tgt_c = str(_src_base / _gen_target_ver)
            _tgt_e = str(_src_base / f"{_gen_target_ver}-enterprise")
            if _os.path.isdir(_tgt_c):
                _gen_target_path = _tgt_c
            elif _os.path.isdir(_tgt_e):
                _gen_target_path = _tgt_e

        async def generate_general():
            try:
                yield _sse({"type": "skills_selected", "skills": _selected_skills})
                async for evt in stream_chat(req.provider, api_key, req.model, None, None, messages, source_path, context_md, version, _user_profile, None, None, _gen_target_path, req.migration_mode, _gen_target_ver, _effective_perspective, _response_language, disabled_tools=req.disabled_tools):
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
    _active_company = active_company_from_cache(profile.company_ids, active_company_id)

    # Resolve company name for the system prompt
    _active_company_name: Optional[str] = None
    if _active_company:
        _active_company_name = _active_company.get("name")

    odoo = OdooClient(
        _active_env.get("db_url") or profile.db_url,
        _active_env.get("db_name") or profile.db_name,
        _active_env.get("login") or profile.login,
        odoo_key, company_id=active_company_id
    )

    source_path = None
    _version_to_use = _active_env.get("odoo_version") or profile.odoo_version
    _sources_base = Path.home() / ".odoo-consultant" / "sources"
    _source_version = None  # Odoo version the resolved sources actually correspond to
    candidate = str(_sources_base / _version_to_use) if _version_to_use else ""
    if _version_to_use and _os.path.isdir(candidate):
        source_path = candidate
        _source_version = _version_to_use
    elif _version_to_use and _os.path.isdir(str(_sources_base / f"{_version_to_use}-enterprise")):
        source_path = str(_sources_base / f"{_version_to_use}-enterprise")
        _source_version = _version_to_use
    else:
        # Fallback : chercher la version la plus récente installée
        sources_base = str(_sources_base)
        if _os.path.isdir(sources_base):
            import re as _re
            _ver_re = _re.compile(r'^\d+\.\d+$')
            available = sorted(
                [d for d in _os.listdir(sources_base) if _ver_re.match(d) and _os.path.isdir(_os.path.join(sources_base, d))],
                reverse=True
            )
            if available:
                source_path = _os.path.join(sources_base, available[0])
                _source_version = available[0]
                if not _version_to_use:
                    _version_to_use = available[0]

    # Loud warning when the resolved sources do not match the instance version —
    # never let the AI reason on the wrong Odoo version silently.
    _source_warning = ""
    if source_path and _version_to_use and _source_version and _source_version != _version_to_use:
        _source_warning = (
            "## ⚠️ Sources Odoo non alignées sur l'instance\n"
            f"L'instance cible tourne en Odoo **{_version_to_use}**, mais ses sources ne sont "
            f"pas installées localement. Les outils `search_odoo_source` / `read_odoo_file` "
            f"interrogent à la place les sources Odoo **{_source_version}**.\n"
            "→ Signale explicitement toute conclusion susceptible de dépendre de la version, "
            f"et invite l'utilisateur à télécharger les sources {_version_to_use} depuis la page Sources."
        )

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
            _tgt_candidate = str(_sources_base / _target_version)
            _tgt_ent = str(_sources_base / f"{_target_version}-enterprise")
            if _os.path.isdir(_tgt_candidate):
                target_path = _tgt_candidate
            elif _os.path.isdir(_tgt_ent):
                target_path = _tgt_ent
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

    # Localization and technical-complexity blocks are high priority: passed
    # into the budget as priority blocks (alongside any source-version warning)
    # so they are never silently truncated by the routed-context packer.
    localization_md = build_localization_context(
        profile.company_ids,
        active_company_id,
        _version_to_use,
        user_prompt,
        _effective_perspective,
    ) if _localization_active else ""
    complexity_md = build_technical_complexity_context(profile.technical_complexity) if _complexity_active else ""
    _complexity_mode = complexity_mode_from_raw(profile.technical_complexity) if _complexity_active else None
    profile_tuning = complexity_profile_block(_complexity_mode, locale=_context_locale) if _complexity_active else ""
    context_md = "" if not _aggregator_active else load_context_for_prompt(
        _version_to_use,
        target_version=_target_version,
        migration=req.migration_mode,
        user_prompt=user_prompt,
        perspective=_effective_perspective,
        locale=_context_locale,
        country_code=(_active_company.get("country_code") if _active_company else None) if _localization_active else None,
        complexity_mode=_complexity_mode,
        disabled_tools=req.disabled_tools,
        priority_blocks=[b for b in (_source_warning, localization_md, complexity_md, profile_tuning) if b],
    )
    _selected_skills = last_selected_skill_names() if _aggregator_active else []

    async def generate():
        try:
            yield _sse({"type": "skills_selected", "skills": _selected_skills})
            async for evt in stream_chat(req.provider, api_key, req.model, odoo, profile, messages, source_path, context_md, _version_to_use, _user_profile, _active_company_name, repo_path, target_path, req.migration_mode, _target_version, _effective_perspective, _response_language, disabled_tools=req.disabled_tools):
                yield _sse(evt)
        except Exception as exc:
            yield _sse({"type": "error", "msg": str(exc)})
        yield _sse({"type": "end"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
