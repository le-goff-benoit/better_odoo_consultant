"""Creator — apply Odoo Studio-style modifications to a live instance.

Flow: the consultant picks a project / environment, writes a functional
request; the AI investigates the live instance and proposes a structured
changeset; a dry-run previews it; the consultant confirms with a
type-to-confirm challenge and the executor applies it via XML-RPC. Restricted
to projects where Studio is in use (complexity mode ``studio`` / ``studio_dev``).
"""

import json
import os
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.database import get_session
from ...core.models import Profile, CreatorRequest
from ...services.odoo_client import OdooClient
from ...services.profile_manager import get_active_env_from_json, get_active_api_key
from ...services.ai_service import stream_chat
from ...services.context_service import load_context_for_prompt, complexity_profile_block
from ...services.localization_service import active_company_from_cache, build_localization_context
from ...services.technical_complexity_service import (
    build_project_context_block, parse_technical_complexity,
    complexity_mode_from_raw,
)
from ...services.creator_service import (
    build_analysis_message, parse_analysis, build_documentation_message,
)
from ...services.creator_executor import apply_changeset
from ...services.preview_service import preview_operation, PREVIEWABLE_OPS
from ...services.studio_feasibility_service import evaluate_changeset
from ...services.creator_intents import build_creator_intent_block
from ...services.creator_validators import validate_changeset
from ...services.attachment_service import ChatAttachment, inject_attachments
from .ai import _ai_key, _sse, _exchange_copilot_token, _PROVIDERS

router = APIRouter()

# Studio operations may only target projects where Studio is actually in use.
# Record operations (create_record / update_record) carry no such restriction.
ELIGIBLE_MODES = {"studio", "studio_dev"}
STUDIO_OP_TYPES = {
    "create_field", "modify_view", "create_server_action",
    "create_automation", "create_cron", "modify_report",
}


# ── Eligible projects ────────────────────────────────────────────

@router.get("/projects")
async def list_eligible_projects(session: AsyncSession = Depends(get_session)):
    """Projects whose technical-complexity mode is studio / studio_dev."""
    result = await session.execute(select(Profile))
    out = []
    for p in result.scalars().all():
        complexity = parse_technical_complexity(p.technical_complexity)
        mode = (complexity or {}).get("mode")
        out.append({
            "id": p.id,
            "name": p.name,
            "company_name": p.company_name,
            "company_logo": p.company_logo,
            "odoo_version": p.odoo_version,
            "environments": p.environments,
            "active_env_id": p.active_env_id,
            "company_ids": p.company_ids,
            "selected_company_id": p.selected_company_id,
            "technical_complexity": p.technical_complexity,
            "studio_mode": mode,
            "eligible": mode in ELIGIBLE_MODES,
        })
    return out


# ── Shared project runtime ───────────────────────────────────────

def _resolve_provider_key(provider: str) -> str:
    if provider not in _PROVIDERS:
        raise HTTPException(400, f"Fournisseur inconnu : {provider}")
    api_key = _ai_key(provider)
    if not api_key:
        raise HTTPException(400, f"Clé API '{provider}' non configurée — ajoutez-la dans les Paramètres.")
    return api_key


def _build_runtime(profile: Profile, env_id: Optional[str], company_id: Optional[int]):
    """Build the live OdooClient + resolve local sources and client repo.

    Mirrors the project-mode setup of /api/ai/chat so the Creator gets the same
    contextual + source assistance as the Assistant and Migration tools.
    Returns (odoo, source_path, repo_path, version, env, active_company_id).
    """
    fallback = {"db_url": profile.db_url, "db_name": profile.db_name,
                "login": profile.login, "odoo_version": profile.odoo_version}
    env = get_active_env_from_json(profile.environments, env_id or profile.active_env_id, fallback)
    odoo_key = get_active_api_key(profile.name, env.get("id", "prod"))
    if not odoo_key:
        raise HTTPException(400, "Clé API Odoo introuvable pour ce projet.")

    active_company_id = company_id or profile.selected_company_id or None
    odoo = OdooClient(
        env.get("db_url") or profile.db_url,
        env.get("db_name") or profile.db_name,
        env.get("login") or profile.login,
        odoo_key, company_id=active_company_id,
    )

    version = env.get("odoo_version") or profile.odoo_version
    source_path = None
    sources_base = Path.home() / ".odoo-consultant" / "sources"
    if version and os.path.isdir(str(sources_base / version)):
        source_path = str(sources_base / version)
    elif version and os.path.isdir(str(sources_base / f"{version}-enterprise")):
        source_path = str(sources_base / f"{version}-enterprise")
    elif sources_base.is_dir():
        ver_re = re.compile(r"^\d+\.\d+$")
        available = sorted(
            [d for d in os.listdir(sources_base)
             if ver_re.match(d) and os.path.isdir(sources_base / d)],
            reverse=True)
        if available:
            source_path = str(sources_base / available[0])

    # Per-environment cloned client repo — gives the AI search_project_source /
    # read_project_file, exactly like the Assistant and Migration tools.
    repo_path = None
    if env.get("github_repo"):
        repo_local = (Path.home() / ".odoo-consultant" / "repos"
                      / profile.name / env.get("id", "prod"))
        if repo_local.is_dir() and (repo_local / ".git").exists():
            repo_path = str(repo_local)

    return odoo, source_path, repo_path, version, env, active_company_id


def _check_operations_allowed(profile: Profile, operations: list[dict]) -> None:
    """Gate a changeset by project eligibility.

    Studio operations require a Studio / Studio + Dev project; record
    operations (create_record / update_record) are allowed on any project.
    """
    has_studio_op = any(
        (op.get("type") or "").strip() in STUDIO_OP_TYPES for op in operations)
    if not has_studio_op:
        return
    complexity = parse_technical_complexity(profile.technical_complexity)
    mode = (complexity or {}).get("mode")
    if mode not in ELIGIBLE_MODES:
        raise HTTPException(
            403, "Les opérations de type Studio sont réservées aux projets "
                 "Studio ou Studio + Dev. Ce projet n'a pas Studio activé — "
                 "seules les modifications de records y sont possibles.")


def _company_name(profile: Profile, company_id: Optional[int]) -> Optional[str]:
    if not company_id or not profile.company_ids:
        return None
    try:
        for c in json.loads(profile.company_ids):
            if c.get("id") == company_id:
                return c.get("name")
    except Exception:
        pass
    return None


def _build_context_md(profile: Profile, version, user_prompt, company_id, disabled_tools: Optional[list[str]] = None):
    active_company = active_company_from_cache(profile.company_ids, company_id)
    localization_md = build_localization_context(
        profile.company_ids, company_id, version, user_prompt, "developer")
    complexity_md = build_project_context_block(
        profile.technical_complexity,
        company_name=profile.company_name,
        company_city=profile.company_city,
        country_code=active_company.get("country_code") if active_company else None,
        country_name=active_company.get("country_name") if active_company else None,
    )
    # Detect the kind of Creator operation the user is asking for (compute,
    # cron, automation, report, bulk records…) and inject a focused snippet —
    # routed as a priority block so it sits before the general routed sections.
    intent_md = build_creator_intent_block(user_prompt or "", locale="fr")
    if intent_md:
        intent_md = "## Spécificité de l'opération demandée\n\n" + intent_md
    complexity_mode = complexity_mode_from_raw(profile.technical_complexity)
    profile_tuning = complexity_profile_block(complexity_mode, locale="fr")
    return load_context_for_prompt(
        version, user_prompt=user_prompt, perspective="developer", locale="fr",
        creation=True,
        country_code=active_company.get("country_code") if active_company else None,
        complexity_mode=complexity_mode,
        disabled_tools=disabled_tools,
        priority_blocks=[b for b in (localization_md, complexity_md, profile_tuning, intent_md) if b])


# ── Analyze (SSE) ────────────────────────────────────────────────

class AnalyzeBody(BaseModel):
    provider: str
    model: Optional[str] = None
    profile_id: int
    env_id: Optional[str] = None
    company_id: Optional[int] = None
    request: str
    instructions: list[str] = Field(default_factory=list)
    attachments: list[ChatAttachment] = Field(default_factory=list)
    disabled_tools: list[str] = Field(default_factory=list)


@router.post("/analyze")
async def analyze(body: AnalyzeBody, session: AsyncSession = Depends(get_session)):
    if not body.request.strip() and not body.attachments:
        raise HTTPException(400, "La demande fonctionnelle est vide.")

    api_key = _resolve_provider_key(body.provider)
    if body.provider == "copilot":
        try:
            api_key = await _exchange_copilot_token(api_key)
        except Exception as exc:
            raise HTTPException(400, f"Impossible d'obtenir le token Copilot : {exc}")

    profile = await session.get(Profile, body.profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable.")

    odoo, source_path, repo_path, version, env, company_id = _build_runtime(
        profile, body.env_id, body.company_id)
    context_md = _build_context_md(profile, version, body.request, company_id, body.disabled_tools)
    user_message = build_analysis_message(body.request, body.instructions)
    messages = inject_attachments(
        [{"role": "user", "content": user_message}], body.attachments)
    company_name = _company_name(profile, company_id)

    async def generate():
        collected: list[str] = []
        try:
            yield _sse({"type": "context", "odoo_version": version,
                        "has_sources": bool(source_path), "has_repo": bool(repo_path)})
            async for evt in stream_chat(
                body.provider, api_key, body.model, odoo, profile, messages,
                source_path, context_md, version, None, company_name,
                repo_path, None, False, None, "developer", "fr",
                disabled_tools=body.disabled_tools,
            ):
                etype = evt.get("type")
                if etype == "text":
                    collected.append(evt.get("content") or "")
                elif etype in ("tool_call", "tool_result", "warning"):
                    yield _sse(evt)
                elif etype == "error":
                    yield _sse(evt)
            analysis = parse_analysis("".join(collected))
            if analysis.get("ok"):
                # Pre-flight: Studio feasibility + structural validation. Both
                # are advisory at this stage — the consultant decides whether
                # to apply, fix, or reject. They are stored on the SSE
                # analysis event so the UI can flag each op immediately.
                ops_list = analysis.get("operations") or []
                analysis["studio_feasibility"] = evaluate_changeset(ops_list)
                analysis["validation"] = validate_changeset(ops_list)
                record = CreatorRequest(
                    profile_id=profile.id,
                    profile_name=profile.name,
                    env_id=env.get("id"),
                    env_label=env.get("name"),
                    company_id=company_id,
                    request_text=body.request,
                    instructions=json.dumps(body.instructions, ensure_ascii=False),
                    functional_analysis=analysis.get("functional_analysis") or "",
                    technical_analysis=analysis.get("technical_analysis") or "",
                    changeset=json.dumps(analysis.get("operations") or [], ensure_ascii=False),
                    status="analyzed",
                    provider=body.provider,
                    model=body.model,
                )
                session.add(record)
                await session.commit()
                await session.refresh(record)
                yield _sse({"type": "analysis", "request_id": record.id, **analysis})
            else:
                yield _sse({"type": "error",
                            "msg": analysis.get("error") or "Analyse illisible."})
        except Exception as exc:
            yield _sse({"type": "error", "msg": str(exc)})
        yield _sse({"type": "end"})

    return StreamingResponse(
        generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Apply ────────────────────────────────────────────────────────

class Operation(BaseModel):
    type: str
    summary: str = ""
    params: dict = Field(default_factory=dict)


class ApplyBody(BaseModel):
    request_id: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    profile_id: int
    env_id: Optional[str] = None
    company_id: Optional[int] = None
    request: str
    instructions: list[str] = Field(default_factory=list)
    functional_analysis: str = ""
    technical_analysis: str = ""
    operations: list[Operation]


@router.post("/apply")
async def apply(body: ApplyBody, session: AsyncSession = Depends(get_session)):
    if not body.operations:
        raise HTTPException(400, "Aucune opération à appliquer.")

    profile = await session.get(Profile, body.profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable.")

    operations = [op.model_dump() for op in body.operations]
    _check_operations_allowed(profile, operations)

    odoo, _src, _repo, version, env, company_id = _build_runtime(
        profile, body.env_id, body.company_id)

    async def save_terminal(status: str, result: dict):
        record = await session.get(CreatorRequest, body.request_id) if body.request_id else None
        if not record:
            record = CreatorRequest(profile_id=profile.id)
        record.profile_id = profile.id
        record.profile_name = profile.name
        record.env_id = env.get("id")
        record.env_label = env.get("name")
        record.company_id = company_id
        record.request_text = body.request
        record.instructions = json.dumps(body.instructions, ensure_ascii=False)
        record.functional_analysis = body.functional_analysis
        record.technical_analysis = body.technical_analysis
        record.changeset = json.dumps(operations, ensure_ascii=False)
        record.apply_result = json.dumps(result, ensure_ascii=False)
        record.status = status
        record.provider = body.provider
        record.model = body.model
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return record

    # A dry-run always runs first: if the preflight finds a problem, nothing
    # is written and the consultant gets the exact list of what failed.
    try:
        preflight = await apply_changeset(odoo, operations, dry_run=True,
                                          version=version)
    except Exception as exc:
        result = {
            "ok": False,
            "dry_run": True,
            "operations": [{"index": 0, "type": "preflight", "summary": "Contrôle préalable", "status": "failed", "error": str(exc)}],
            "rolled_back": False,
            "rollback_errors": [],
        }
        record = await save_terminal("failed", result)
        return {"ok": False, "stage": "preflight", "request_id": record.id, "preflight": result}
    if not preflight.get("ok"):
        record = await save_terminal("failed", preflight)
        return {"ok": False, "stage": "preflight", "request_id": record.id, "preflight": preflight}

    try:
        result = await apply_changeset(odoo, operations, version=version)
    except Exception as exc:
        result = {
            "ok": False,
            "dry_run": False,
            "operations": [{"index": 0, "type": "apply", "summary": "Application", "status": "failed", "error": str(exc)}],
            "rolled_back": False,
            "rollback_errors": [],
        }

    record = await save_terminal("applied" if result.get("ok") else "failed", result)

    return {"ok": result.get("ok"), "stage": "applied",
            "request_id": record.id, "result": result, "preflight": preflight}


# ── Dry-run (preflight) ──────────────────────────────────────────

class DryRunBody(BaseModel):
    profile_id: int
    env_id: Optional[str] = None
    company_id: Optional[int] = None
    operations: list[Operation]


@router.post("/dry-run")
async def dry_run(body: DryRunBody, session: AsyncSession = Depends(get_session)):
    """Preflight a changeset — resolve and validate every target against the
    live instance without writing anything. Read-only, so no password required."""
    if not body.operations:
        raise HTTPException(400, "Aucune opération à contrôler.")
    profile = await session.get(Profile, body.profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable.")
    operations = [op.model_dump() for op in body.operations]
    _check_operations_allowed(profile, operations)
    odoo, _src, _repo, version, _env, _cid = _build_runtime(
        profile, body.env_id, body.company_id)
    try:
        return await apply_changeset(odoo, operations, dry_run=True,
                                     version=version)
    except Exception as exc:
        raise HTTPException(500, f"Échec du contrôle préalable : {exc}")


# ── Preview ──────────────────────────────────────────────────────

class PreviewBody(BaseModel):
    profile_id: int
    env_id: Optional[str] = None
    company_id: Optional[int] = None
    operations: list[Operation]
    index: int


@router.post("/preview")
async def preview(body: PreviewBody, session: AsyncSession = Depends(get_session)):
    """Compute a before/after preview of the modify_view / modify_report
    operation at ``index``, in the context of the whole changeset (preceding
    create_field operations are applied first). Everything is created
    transiently and rolled back — nothing is persisted. Also acts as a
    validation gate (valid / error)."""
    if not body.operations or body.index < 0 or body.index >= len(body.operations):
        raise HTTPException(400, "Opération à prévisualiser introuvable.")
    operations = [op.model_dump() for op in body.operations]
    if operations[body.index].get("type") not in PREVIEWABLE_OPS:
        raise HTTPException(400, "Aperçu disponible uniquement pour les vues et les rapports.")
    profile = await session.get(Profile, body.profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable.")
    _check_operations_allowed(profile, operations)
    odoo, _src, _repo, version, _env, _cid = _build_runtime(
        profile, body.env_id, body.company_id)
    try:
        result = await preview_operation(odoo, operations, body.index, version)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Échec de l'aperçu : {exc}")
    # Studio feasibility verdict for the changeset — purely advisory, shown
    # alongside the visual preview so the user sees where the Studio frontier
    # sits for this specific request.
    if isinstance(result, dict):
        result["studio_feasibility"] = evaluate_changeset(operations)
    return result


# ── Reject ───────────────────────────────────────────────────────

class RejectBody(BaseModel):
    request_id: Optional[int] = None
    profile_id: int
    env_id: Optional[str] = None
    company_id: Optional[int] = None
    request: str
    instructions: list[str] = Field(default_factory=list)
    functional_analysis: str = ""
    technical_analysis: str = ""
    operations: list[Operation] = Field(default_factory=list)


@router.post("/reject")
async def reject(body: RejectBody, session: AsyncSession = Depends(get_session)):
    """Log a rejected proposal — closes the request without touching Odoo."""
    profile = await session.get(Profile, body.profile_id)
    record = await session.get(CreatorRequest, body.request_id) if body.request_id else None
    if not record:
        record = CreatorRequest(profile_id=body.profile_id)
    record.profile_id = body.profile_id
    record.profile_name = profile.name if profile else None
    record.env_id = body.env_id
    record.company_id = body.company_id
    record.request_text = body.request
    record.instructions = json.dumps(body.instructions, ensure_ascii=False)
    record.functional_analysis = body.functional_analysis
    record.technical_analysis = body.technical_analysis
    record.changeset = json.dumps([op.model_dump() for op in body.operations], ensure_ascii=False)
    record.status = "rejected"
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return {"ok": True, "request_id": record.id}


# ── Documentation ────────────────────────────────────────────────

class DocumentBody(BaseModel):
    request_id: Optional[int] = None
    provider: str
    model: Optional[str] = None
    profile_id: int
    env_id: Optional[str] = None
    company_id: Optional[int] = None
    request: str
    functional_analysis: str = ""
    technical_analysis: str = ""
    apply_result: dict = Field(default_factory=dict)


@router.post("/document")
async def document(body: DocumentBody, session: AsyncSession = Depends(get_session)):
    api_key = _resolve_provider_key(body.provider)
    if body.provider == "copilot":
        try:
            api_key = await _exchange_copilot_token(api_key)
        except Exception as exc:
            raise HTTPException(400, f"Impossible d'obtenir le token Copilot : {exc}")

    profile = await session.get(Profile, body.profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable.")

    odoo, source_path, repo_path, version, _env, company_id = _build_runtime(
        profile, body.env_id, body.company_id)
    context_md = _build_context_md(profile, version, body.request, company_id)
    message = build_documentation_message(
        body.request, body.functional_analysis, body.technical_analysis, body.apply_result)

    collected: list[str] = []
    try:
        async for evt in stream_chat(
            body.provider, api_key, body.model, odoo, profile,
            [{"role": "user", "content": message}],
            source_path, context_md, version, None, _company_name(profile, company_id),
            repo_path, None, False, None, "developer", "fr",
        ):
            if evt.get("type") == "text":
                collected.append(evt.get("content") or "")
            elif evt.get("type") == "error":
                raise HTTPException(502, evt.get("msg") or "Erreur IA.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Génération de la documentation impossible : {exc}")

    documentation = "".join(collected).strip()
    if body.request_id is not None:
        record = await session.get(CreatorRequest, body.request_id)
        if record:
            record.documentation = documentation
            session.add(record)
            await session.commit()
    return {"ok": True, "documentation": documentation}


# ── History ──────────────────────────────────────────────────────

def _json_or(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def _history_row(r: CreatorRequest, detailed: bool = False):
    row = {
        "id": r.id,
        "profile_id": r.profile_id,
        "profile_name": r.profile_name,
        "env_id": r.env_id,
        "env_label": r.env_label,
        "company_id": r.company_id,
        "request_text": r.request_text,
        "status": r.status,
        "provider": r.provider,
        "model": r.model,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "has_documentation": bool(r.documentation),
    }
    if detailed:
        row.update({
            "instructions": _json_or(r.instructions, []),
            "functional_analysis": r.functional_analysis or "",
            "technical_analysis": r.technical_analysis or "",
            "changeset": _json_or(r.changeset, []),
            "apply_result": _json_or(r.apply_result, None),
            "documentation": r.documentation or "",
        })
    return row

@router.get("/history")
async def history(limit: int = 50, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(CreatorRequest).order_by(CreatorRequest.created_at.desc()).limit(limit))
    rows = result.scalars().all()
    return [_history_row(r) for r in rows]


@router.get("/history/{request_id}")
async def history_detail(request_id: int, session: AsyncSession = Depends(get_session)):
    record = await session.get(CreatorRequest, request_id)
    if not record:
        raise HTTPException(404, "Demande Creator introuvable.")
    return _history_row(record, detailed=True)
