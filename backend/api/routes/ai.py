import asyncio
import json
import uuid
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
    _infer_perspective, _normalize_perspective, _last_user_text,
)
from ...services.orchestration_service import (
    AgentOrchestrationDecision,
    decide_orchestration,
)
from ...services.context_service import (
    load_context_for_prompt,
    complexity_profile_block,
    last_selected_skill_names,
    last_skill_route_candidates,
    last_output_template_selection,
    last_context_trace,
)
from ...services.localization_service import active_company_from_cache, build_localization_context
from ...services.technical_complexity_service import build_project_context_block, complexity_mode_from_raw
from ...services.attachment_service import ChatAttachment, inject_attachments
from ...services.runtime_trace_store import get_runtime_trace_summary, persist_runtime_trace_summary
from ...skills.registry import (
    skill_catalog, skill_diagram, skill_by_name,
    normalize_disabled_skill_names,
    skill_registry_diagnostics,
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


def _skills_selected_payload(
    skills: list[str],
    candidates: list[dict],
    output_template: Optional[dict] = None,
    *,
    run_id: Optional[str] = None,
    context_trace: Optional[list[dict]] = None,
) -> dict:
    payload = {"type": "skills_selected", "skills": skills, "candidates": candidates}
    if output_template:
        payload["output_template"] = output_template
    if run_id:
        payload["run_id"] = run_id
    if context_trace:
        payload["context_trace"] = context_trace
    return payload


def _agent_selected_payload(
    agent: str,
    routing_info: dict,
    *,
    run_id: Optional[str] = None,
) -> dict:
    """SSE payload mirroring ``skills_selected`` for the active agent.

    ``routing_info`` is the dict produced by ``_infer_perspective.last_result``
    (or a synthesised equivalent when the client explicitly picked an agent
    in the UI). Fields: ``selected``, ``mode``, ``confidence``, ``reason``,
    ``candidates: [{name, score}]``."""
    payload = {
        "type": "agent_selected",
        "agent": agent,
        "mode": routing_info.get("mode", "unknown"),
        "confidence": routing_info.get("confidence", "low"),
        "reason": routing_info.get("reason", ""),
        "candidates": routing_info.get("candidates", []),
    }
    if run_id:
        payload["run_id"] = run_id
    return payload


def _orchestration_selected_payload(
    decision: AgentOrchestrationDecision,
    *,
    run_id: Optional[str] = None,
) -> dict:
    payload = {"type": "orchestration_selected", "orchestration": decision.to_dict()}
    if run_id:
        payload["run_id"] = run_id
    return payload


def _orchestration_step_payload(
    decision: AgentOrchestrationDecision,
    *,
    step: int,
    status: str,
    run_id: Optional[str] = None,
    chars: Optional[int] = None,
) -> dict:
    selected = next((item for item in decision.sequence if item.step == step), None)
    payload = {
        "type": "orchestration_step",
        "mode": decision.mode,
        "step": step,
        "status": status,
    }
    if selected:
        payload.update(selected.to_dict())
    if chars is not None:
        payload["chars"] = chars
    if run_id:
        payload["run_id"] = run_id
    return payload


async def _collect_internal_agent_text(*args, **kwargs) -> str:
    """Run a non-final agent step and return its terminal text.

    Tool/runtime events are intentionally not forwarded to the browser in V1:
    the UI only needs to show that a sequence is happening, while the final
    agent remains responsible for the user-facing answer.
    """
    chunks: list[str] = []
    last_error = ""
    async for evt in stream_chat(*args, **kwargs):
        if evt.get("type") == "text" and evt.get("content"):
            chunks.append(str(evt.get("content") or ""))
        elif evt.get("type") == "error":
            last_error = str(evt.get("msg") or "")
    text = "\n\n".join(chunk.strip() for chunk in chunks if chunk.strip()).strip()
    if text:
        return text
    if last_error:
        return f"Étape intermédiaire échouée : {last_error}"
    return "Étape intermédiaire terminée sans sortie exploitable."


def _messages_for_intermediate_step(messages: list[dict], decision: AgentOrchestrationDecision) -> list[dict]:
    step = decision.sequence[0]
    patched = [dict(m) for m in messages]
    if not patched:
        return patched
    original = str(patched[-1].get("content") or "")
    patched[-1] = {
        **patched[-1],
        "content": (
            f"{original}\n\n---\n\n"
            "Tu es l'agent intermédiaire d'une séquence multi-agent. "
            f"Objectif de cette étape : {step.purpose}\n"
            "Produis une analyse courte et structurée. Ne rédige pas la réponse finale utilisateur. "
            "Retourne seulement les faits utiles, hypothèses, risques et recommandation de ton rôle."
        ).strip(),
    }
    return patched


def _messages_for_final_step(messages: list[dict], decision: AgentOrchestrationDecision, intermediate_text: str) -> list[dict]:
    patched = [dict(m) for m in messages]
    if not patched:
        return patched
    original = str(patched[-1].get("content") or "")
    first = decision.sequence[0]
    final = decision.sequence[-1]
    patched[-1] = {
        **patched[-1],
        "content": (
            f"{original}\n\n---\n\n"
            "Séquence multi-agent active.\n"
            f"Étape précédente : agent `{first.agent}` — {first.purpose}\n\n"
            f"Sortie structurée de l'étape précédente :\n{intermediate_text}\n\n"
            f"Ton rôle final : agent `{final.agent}` — {final.purpose}\n"
            "Utilise cette analyse comme entrée obligatoire, tranche les éventuelles ambiguïtés, "
            "et rédige uniquement la réponse finale destinée à l'utilisateur."
        ).strip(),
    }
    return patched


def _resolve_perspective_with_log(req_perspective: Optional[str], user_prompt: str) -> tuple[str, dict]:
    """Resolve the request's perspective field into a concrete agent name plus
    routing-decision log. When the client sent an explicit role we record
    ``mode='explicit_ui'`` with confidence=high; only ``auto`` (or empty)
    triggers ``_infer_perspective`` which fills its own side-channel."""
    raw = (req_perspective or "").strip().lower()
    if raw and raw not in ("auto",):
        normalised = _normalize_perspective(raw)
        return normalised, {
            "selected": normalised,
            "mode": "explicit_ui",
            "confidence": "high",
            "reason": f"User selected '{raw}' in the UI",
            "candidates": [{"name": normalised, "score": 100}],
        }
    inferred = _infer_perspective(user_prompt or "")
    info = dict(getattr(_infer_perspective, "last_result", {}) or {})
    info.setdefault("selected", inferred)
    return inferred, info


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


def _clean_disabled_tools(disabled: list) -> tuple[list[str], list[str]]:
    return normalize_disabled_skill_names(disabled)


def _write_tool_config(config: dict) -> None:
    _TOOL_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _TOOL_CONFIG_PATH.write_text(json.dumps(config, indent=2))


@router.get("/tool-config")
async def get_tool_config():
    raw = _read_tool_config()
    disabled, ignored_locked = _clean_disabled_tools(raw.get("disabled_tools", []))
    if disabled != raw.get("disabled_tools", []):
        _write_tool_config({"disabled_tools": disabled})
    return {"disabled_tools": disabled, "locked_ignored": ignored_locked}


@router.get("/skills")
async def get_skills():
    return {"skills": skill_catalog(), "diagnostics": skill_registry_diagnostics()}


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


@router.get("/skills/{name}/markdown")
async def get_skill_markdown(name: str):
    skill = skill_by_name(name)
    if skill is None:
        raise HTTPException(404, "Skill inconnu")
    skill_file = Path(skill.folder) / "SKILL.md"
    if not skill_file.is_file():
        raise HTTPException(404, "SKILL.md introuvable")
    return {"name": skill.name, "filename": "SKILL.md", "content": skill_file.read_text(encoding="utf-8")}


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


@router.get("/skills/{name}/eval-queries")
async def get_skill_eval_queries(name: str):
    """Return the ``eval_queries.json`` for a skill (used by the Settings
    detail panel to surface routing regression cases)."""
    skill = skill_by_name(name)
    if skill is None or not skill.folder:
        raise HTTPException(404, "Skill inconnu")
    eval_path = Path(skill.folder) / "eval_queries.json"
    if not eval_path.is_file():
        return {"name": skill.name, "queries": [], "available": False}
    try:
        import json as _json
        data = _json.loads(eval_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(500, f"eval_queries.json invalide : {exc}")
    if not isinstance(data, list):
        raise HTTPException(500, "eval_queries.json doit être une liste")
    return {"name": skill.name, "queries": data, "available": True}


@router.get("/runtime-traces/{run_id}")
async def get_runtime_trace(run_id: str):
    summary = get_runtime_trace_summary(run_id)
    if summary is None:
        raise HTTPException(404, "Trace runtime introuvable")
    return summary


@router.post("/tool-config")
async def save_tool_config(config: dict):
    # Accept both legacy "disabled_tools" and unified "disabled_skills" payloads.
    disabled = config.get("disabled_skills", config.get("disabled_tools", []))
    if not isinstance(disabled, list):
        raise HTTPException(400, "disabled_skills doit être une liste")
    cleaned, ignored_locked = _clean_disabled_tools(disabled)
    _write_tool_config({"disabled_tools": cleaned})
    return {"ok": True, "disabled_tools": cleaned, "locked_ignored": ignored_locked}


@router.get("/providers")
async def list_providers():
    return {p: bool(_ai_key(p)) for p in _PROVIDERS}


@router.get("/github/models")
async def list_github_models():
    """Retourne la liste live des modèles disponibles via GitHub Models pour ce token."""
    token = _ai_key("github")
    if not token:
        raise HTTPException(401, "Token GitHub non configuré")
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{GITHUB_MODELS_BASE_URL}/v1/models",
            headers={"Authorization": f"Bearer {token}"},
        )
    if not resp.is_success:
        raise HTTPException(resp.status_code, f"GitHub Models API : {resp.text[:300]}")
    data = resp.json()
    models = sorted(
        [m["id"] for m in data.get("data", []) if isinstance(m, dict) and "id" in m]
    )
    return {"models": models}


@router.get("/copilot/models")
async def list_copilot_models():
    """Retourne la liste live des modèles disponibles via GitHub Copilot pour ce token."""
    oauth_token = _ai_key("copilot")
    if not oauth_token:
        raise HTTPException(401, "Token Copilot non configuré")
    try:
        copilot_token = await _exchange_copilot_token(oauth_token)
    except Exception as exc:
        raise HTTPException(401, f"Échange token Copilot échoué : {exc}") from exc
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{COPILOT_BASE_URL}/models",
            headers={**COPILOT_HEADERS, "Authorization": f"Bearer {copilot_token}"},
        )
    if not resp.is_success:
        raise HTTPException(resp.status_code, f"Copilot API : {resp.text[:300]}")
    data = resp.json()
    models = sorted(
        [m["id"] for m in data.get("data", []) if isinstance(m, dict) and "id" in m]
    )
    return {"models": models}


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
    # before assembly (runtime_perspective_router, runtime_context_aggregator, runtime_localization_detector,
    # runtime_complexity_analyzer). Sub-skills consumed inside context_service are gated
    # inside that module (runtime_release_notes_injector, runtime_skill_dispatcher).
    _disabled_tools_cleaned, _ignored_locked_tools = _clean_disabled_tools(req.disabled_tools or [])
    _disabled_skills = set(_disabled_tools_cleaned)
    _perspective_active = "runtime_perspective_router" not in _disabled_skills
    _aggregator_active = "runtime_context_aggregator" not in _disabled_skills
    _localization_active = "runtime_localization_detector" not in _disabled_skills
    _complexity_active = "runtime_complexity_analyzer" not in _disabled_skills
    # Effective perspective: when the router is disabled, fall back to a neutral
    # developer baseline so no role bias leaks into the prompt.
    if _perspective_active:
        _effective_perspective, _agent_routing_info = _resolve_perspective_with_log(req.perspective, user_prompt)
    else:
        _effective_perspective = "developer"
        _agent_routing_info = {
            "selected": "developer",
            "mode": "router_disabled",
            "confidence": "low",
            "reason": "runtime_perspective_router disabled by user",
            "candidates": [],
        }
    _explicit_agent = (req.perspective or "").strip().lower() or None
    _orchestration = decide_orchestration(
        user_prompt=user_prompt,
        effective_agent=_effective_perspective,
        explicit_agent=_explicit_agent,
        perspective_router_active=_perspective_active,
    )
    if _orchestration.mode == "sequential_agents":
        _effective_perspective = _orchestration.final_agent
        _agent_routing_info = {
            "selected": _effective_perspective,
            "mode": "orchestration_final",
            "confidence": "high",
            "reason": _orchestration.reason,
            "candidates": [
                {"name": step.agent, "score": 100 - step.step}
                for step in _orchestration.sequence
            ],
        }

    # ── General / Migration mode (no profile) ─────────────────────
    if req.profile_id is None:
        _run_id = f"chat-{uuid.uuid4().hex[:12]}"
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
            disabled_tools=_disabled_tools_cleaned,
            run_id=_run_id,
        )
        _selected_skills = last_selected_skill_names() if _aggregator_active else []
        _skill_candidates = last_skill_route_candidates() if _aggregator_active else []
        _output_template = last_output_template_selection() if _aggregator_active else None
        _context_trace = last_context_trace() if _aggregator_active else []
        _first_step_context_md = ""
        if _aggregator_active and _orchestration.mode == "sequential_agents" and _orchestration.sequence:
            _first_step_context_md = load_context_for_prompt(
                version,
                target_version=_gen_target_ver,
                migration=req.migration_mode,
                user_prompt=user_prompt,
                perspective=_orchestration.sequence[0].agent,
                locale=_context_locale,
                country_code=req.country_code if _localization_active else None,
                force_localization=bool(req.country_code) and _localization_active,
                disabled_tools=_disabled_tools_cleaned,
                run_id=f"{_run_id}-step1",
            )
        if _aggregator_active:
            persist_runtime_trace_summary(
                run_id=_run_id,
                selected_skills=_selected_skills,
                candidates=_skill_candidates,
                context_trace=_context_trace,
                output_template=_output_template,
                orchestration=_orchestration.to_dict(),
                provider=req.provider,
                mode="migration" if req.migration_mode else "general",
            )

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
                yield _sse(_orchestration_selected_payload(_orchestration, run_id=_run_id))
                yield _sse(_agent_selected_payload(_effective_perspective, _agent_routing_info, run_id=_run_id))
                yield _sse(_skills_selected_payload(_selected_skills, _skill_candidates, _output_template, run_id=_run_id, context_trace=_context_trace))
                final_messages = messages
                if _orchestration.mode == "sequential_agents" and _orchestration.sequence:
                    yield _sse(_orchestration_step_payload(_orchestration, step=1, status="running", run_id=_run_id))
                    intermediate_text = await _collect_internal_agent_text(
                        req.provider, api_key, req.model, None, None,
                        _messages_for_intermediate_step(messages, _orchestration),
                        source_path, _first_step_context_md, version, _user_profile,
                        None, None, _gen_target_path, req.migration_mode, _gen_target_ver,
                        _orchestration.sequence[0].agent, _response_language,
                        disabled_tools=_disabled_tools_cleaned, run_id=f"{_run_id}-step1",
                        country_code=req.country_code,
                    )
                    yield _sse(_orchestration_step_payload(_orchestration, step=1, status="done", run_id=_run_id, chars=len(intermediate_text)))
                    yield _sse(_orchestration_step_payload(_orchestration, step=2, status="running", run_id=_run_id))
                    final_messages = _messages_for_final_step(messages, _orchestration, intermediate_text)
                async for evt in stream_chat(req.provider, api_key, req.model, None, None, final_messages, source_path, context_md, version, _user_profile, None, None, _gen_target_path, req.migration_mode, _gen_target_ver, _effective_perspective, _response_language, disabled_tools=_disabled_tools_cleaned, run_id=_run_id, country_code=req.country_code):
                    yield _sse(evt)
                if _orchestration.mode == "sequential_agents":
                    yield _sse(_orchestration_step_payload(_orchestration, step=2, status="done", run_id=_run_id))
            except Exception as exc:
                yield _sse({"type": "error", "msg": str(exc)})
            yield _sse({"type": "end"})

        return StreamingResponse(
            generate_general(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ── Project mode (with profile) ────────────────────────────────
    _run_id = f"chat-{uuid.uuid4().hex[:12]}"
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
            f"pas installées localement. Les outils `source_search_odoo` / `source_read_odoo_file` "
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
    _complexity_mode = complexity_mode_from_raw(profile.technical_complexity) if _complexity_active else None
    profile_tuning = complexity_profile_block(_complexity_mode, locale=_context_locale) if _complexity_active else ""
    # Bloc « Contexte projet » prioritaire (non tronqué) : qui est le client,
    # où il est, et quel est le profil technique. Toujours injecté pour ne
    # jamais laisser l'IA répondre comme si la base était vanilla par défaut.
    complexity_md = build_project_context_block(
        profile.technical_complexity if _complexity_active else None,
        company_name=profile.company_name,
        company_city=profile.company_city,
        country_code=(_active_company.get("country_code") if _active_company else None),
        country_name=(_active_company.get("country_name") if _active_company else None),
    )
    context_md = "" if not _aggregator_active else load_context_for_prompt(
        _version_to_use,
        target_version=_target_version,
        migration=req.migration_mode,
        user_prompt=user_prompt,
        perspective=_effective_perspective,
        locale=_context_locale,
        country_code=(_active_company.get("country_code") if _active_company else None) if _localization_active else None,
        complexity_mode=_complexity_mode,
        disabled_tools=_disabled_tools_cleaned,
        priority_blocks=[b for b in (_source_warning, localization_md, complexity_md, profile_tuning) if b],
        run_id=_run_id,
    )
    _selected_skills = last_selected_skill_names() if _aggregator_active else []
    _skill_candidates = last_skill_route_candidates() if _aggregator_active else []
    _output_template = last_output_template_selection() if _aggregator_active else None
    _context_trace = last_context_trace() if _aggregator_active else []
    _first_step_context_md = ""
    if _aggregator_active and _orchestration.mode == "sequential_agents" and _orchestration.sequence:
        _first_step_context_md = load_context_for_prompt(
            _version_to_use,
            target_version=_target_version,
            migration=req.migration_mode,
            user_prompt=user_prompt,
            perspective=_orchestration.sequence[0].agent,
            locale=_context_locale,
            country_code=(_active_company.get("country_code") if _active_company else None) if _localization_active else None,
            complexity_mode=_complexity_mode,
            disabled_tools=_disabled_tools_cleaned,
            priority_blocks=[b for b in (_source_warning, localization_md, complexity_md, profile_tuning) if b],
            run_id=f"{_run_id}-step1",
        )
    if _aggregator_active:
        persist_runtime_trace_summary(
            run_id=_run_id,
            selected_skills=_selected_skills,
            candidates=_skill_candidates,
            context_trace=_context_trace,
            output_template=_output_template,
            orchestration=_orchestration.to_dict(),
            provider=req.provider,
            mode="migration" if req.migration_mode else "assistant",
        )

    async def generate():
        try:
            yield _sse(_orchestration_selected_payload(_orchestration, run_id=_run_id))
            yield _sse(_agent_selected_payload(_effective_perspective, _agent_routing_info, run_id=_run_id))
            yield _sse(_skills_selected_payload(_selected_skills, _skill_candidates, _output_template, run_id=_run_id, context_trace=_context_trace))
            final_messages = messages
            if _orchestration.mode == "sequential_agents" and _orchestration.sequence:
                yield _sse(_orchestration_step_payload(_orchestration, step=1, status="running", run_id=_run_id))
                intermediate_text = await _collect_internal_agent_text(
                    req.provider, api_key, req.model, odoo, profile,
                    _messages_for_intermediate_step(messages, _orchestration),
                    source_path, _first_step_context_md, _version_to_use, _user_profile,
                    _active_company_name, repo_path, target_path, req.migration_mode,
                    _target_version, _orchestration.sequence[0].agent, _response_language,
                    disabled_tools=_disabled_tools_cleaned, run_id=f"{_run_id}-step1",
                    country_code=(_active_company.get("country_code") if _active_company else None),
                    country_name=(_active_company.get("country_name") if _active_company else None),
                )
                yield _sse(_orchestration_step_payload(_orchestration, step=1, status="done", run_id=_run_id, chars=len(intermediate_text)))
                yield _sse(_orchestration_step_payload(_orchestration, step=2, status="running", run_id=_run_id))
                final_messages = _messages_for_final_step(messages, _orchestration, intermediate_text)
            async for evt in stream_chat(req.provider, api_key, req.model, odoo, profile, final_messages, source_path, context_md, _version_to_use, _user_profile, _active_company_name, repo_path, target_path, req.migration_mode, _target_version, _effective_perspective, _response_language, disabled_tools=_disabled_tools_cleaned, run_id=_run_id, country_code=(_active_company.get("country_code") if _active_company else None), country_name=(_active_company.get("country_name") if _active_company else None)):
                yield _sse(evt)
            if _orchestration.mode == "sequential_agents":
                yield _sse(_orchestration_step_payload(_orchestration, step=2, status="done", run_id=_run_id))
        except Exception as exc:
            yield _sse({"type": "error", "msg": str(exc)})
        yield _sse({"type": "end"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
