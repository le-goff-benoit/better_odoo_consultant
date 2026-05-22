import asyncio
import json
import logging
import os as _os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...core.models import Profile
from ...services.profile_manager import (
    store_profile_secrets, get_profile_api_key, delete_profile_secrets,
    store_env_api_key, get_env_api_key, delete_env_api_key,
    get_active_env_from_json, get_active_api_key,
)
from ...services.odoo_client import OdooClient
from ...services.localization_service import (
    detect_company_localizations,
    dump_company_cache,
    merge_company_localizations,
)
from ...services.technical_complexity_service import (
    analyze_technical_complexity,
    dump_technical_complexity,
)

log = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic models ────────────────────────────────────────────

class ProfileCreate(BaseModel):
    name: str
    odoo_sh_url: Optional[str] = None
    db_url: str
    db_name: str
    login: str
    api_key: str
    github_repo: Optional[str] = None
    default_branch: Optional[str] = None
    odoo_version: Optional[str] = None
    environments: Optional[str] = None
    company_name: Optional[str] = None
    company_city: Optional[str] = None
    company_logo: Optional[str] = None
    company_ids: Optional[str] = None
    api_key_expires: Optional[str] = None


class ProfileUpdate(BaseModel):
    odoo_sh_url: Optional[str] = None
    db_url: Optional[str] = None
    db_name: Optional[str] = None
    login: Optional[str] = None
    api_key: Optional[str] = None
    github_repo: Optional[str] = None
    default_branch: Optional[str] = None
    odoo_version: Optional[str] = None
    environments: Optional[str] = None
    active_env_id: Optional[str] = None
    company_name: Optional[str] = None
    company_city: Optional[str] = None
    company_logo: Optional[str] = None
    company_ids: Optional[str] = None
    api_key_expires: Optional[str] = None
    selected_company_id: Optional[int] = None
    user_access_info: Optional[str] = None
    project_context: Optional[str] = None
    technical_complexity: Optional[str] = None


class EnvCreate(BaseModel):
    id: str
    name: str
    db_url: str
    db_name: str
    login: str
    api_key: str
    odoo_version: Optional[str] = None
    branch: Optional[str] = None
    github_repo: Optional[str] = None
    repo_branch: Optional[str] = None


class EnvUpdate(BaseModel):
    name: Optional[str] = None
    db_url: Optional[str] = None
    db_name: Optional[str] = None
    login: Optional[str] = None
    api_key: Optional[str] = None
    odoo_version: Optional[str] = None
    branch: Optional[str] = None
    github_repo: Optional[str] = None
    repo_branch: Optional[str] = None


class ContextAutoFillRequest(BaseModel):
    pass  # no body needed — profile data is fetched from DB


class AccessCheckRequest(BaseModel):
    db_url: str
    db_name: str
    login: str
    api_key: str


class DiagnoseRequest(BaseModel):
    db_url: str
    db_name: str
    login: str
    api_key: str


# ── Helpers ────────────────────────────────────────────────────

def _normalise_url(raw: str) -> str:
    url = raw.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def _suggest_db_name(url: str) -> str:
    """Extract subdomain from URL as db_name suggestion."""
    import re
    m = re.match(r"https?://([^./]+)", url)
    return m.group(1) if m else ""


# ── Routes ─────────────────────────────────────────────────────

def _auto_migrate_environments(profile: Profile) -> bool:
    """Populate environments JSON from legacy fields if missing. Returns True if changed."""
    try:
        envs = json.loads(profile.environments or "[]")
    except Exception:
        envs = []
    if envs:
        return False
    envs = [{
        "id": "prod",
        "name": "Production",
        "db_url": profile.db_url,
        "db_name": profile.db_name,
        "login": profile.login,
        "odoo_version": profile.odoo_version,
        "branch": profile.default_branch,
    }]
    profile.environments = json.dumps(envs)
    if not profile.active_env_id:
        profile.active_env_id = "prod"
    return True


@router.get("/")
async def list_profiles(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Profile))
    profiles = list(result.scalars().all())
    changed = [p for p in profiles if _auto_migrate_environments(p)]
    if changed:
        for p in changed:
            p.updated_at = datetime.utcnow()
            session.add(p)
        await session.commit()
        for p in changed:
            await session.refresh(p)
    return profiles


@router.post("/diagnose")
async def diagnose(body: DiagnoseRequest):
    """
    Step-by-step connection test. Always returns 200 with per-step results —
    never raises 400. The frontend decides what to show.
    """
    url = _normalise_url(body.db_url)
    loop = asyncio.get_event_loop()
    steps: list[dict] = []

    def step(name: str, ok: bool, detail: str, data: dict | None = None):
        steps.append({"name": name, "ok": ok, "detail": detail, **(data or {})})

    # Step 1 — server reachable + version (no auth needed)
    odoo_version = None
    server_version_raw = None
    try:
        import xmlrpc.client
        common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
        info = await loop.run_in_executor(None, common.version)
        server_version_raw = info.get("server_version", "")
        parts = server_version_raw.split(".")
        if len(parts) >= 2:
            minor = parts[1].split("+")[0].split("-")[0]
            odoo_version = f"{parts[0]}.{minor}"
        else:
            odoo_version = server_version_raw
        step("Serveur joignable", True,
             f"Odoo {odoo_version} détecté sur {url}",
             {"odoo_version": odoo_version, "server_version": server_version_raw})
    except Exception as exc:
        msg = str(exc)
        if "refused" in msg.lower() or "name or service" in msg.lower() or "nodename" in msg.lower():
            detail = f"Impossible de joindre {url} — vérifiez l'URL et votre connexion internet."
        elif "timeout" in msg.lower():
            detail = f"Le serveur {url} ne répond pas (timeout)."
        elif "ssl" in msg.lower() or "certificate" in msg.lower():
            detail = f"Erreur SSL — essayez avec http:// ou vérifiez le certificat."
        else:
            detail = f"Erreur : {msg}"
        step("Serveur joignable", False, detail)
        return {"steps": steps, "uid": None, "odoo_version": None,
                "module_count": 0, "db_name_suggestion": _suggest_db_name(url)}

    # Step 2 — authenticate
    uid = None
    try:
        client = OdooClient(url, body.db_name, body.login, body.api_key)
        uid = await loop.run_in_executor(None, client.authenticate)
        step("Authentification", True,
             f"Connecté en tant que uid={uid} sur la base « {body.db_name} »",
             {"uid": uid})
    except Exception as exc:
        msg = str(exc)
        suggestion = _suggest_db_name(url)
        if "access denied" in msg.lower() or "authentication" in msg.lower() or not uid:
            detail = (
                f"Connexion refusée sur la base « {body.db_name} ».\n"
                f"• Vérifiez que le nom de base est exact (suggestion : « {suggestion} »)\n"
                f"• Vérifiez votre login ({body.login}) et votre clé API."
            )
        else:
            detail = f"Erreur d'authentification : {msg}"
        step("Authentification", False, detail)
        return {"steps": steps, "uid": None, "odoo_version": odoo_version,
                "module_count": 0, "db_name_suggestion": suggestion}

    # Step 3 — modules (best-effort)
    modules: list = []
    try:
        modules = await loop.run_in_executor(
            None,
            lambda: client.search_read(
                "ir.module.module",
                [["state", "=", "installed"]],
                ["name", "shortdesc"],
                limit=500,
            )
        )
        step("Modules installés", True, f"{len(modules)} modules trouvés")
    except Exception as exc:
        step("Modules installés", False, f"Non récupérés (non bloquant) : {exc}")

    # Step 4 — company info (best-effort, not shown as a step)
    company_name = company_city = company_logo = None
    try:
        import base64 as _b64
        companies = await loop.run_in_executor(
            None,
            lambda: client.search_read(
                "res.company", [], ["name", "city", "logo_web"], limit=1
            )
        )
        if companies:
            c = companies[0]
            company_name = c.get("name") or None
            company_city = c.get("city") or None
            raw = c.get("logo_web") or c.get("logo")
            if raw:
                if hasattr(raw, "data"):
                    company_logo = "data:image/png;base64," + _b64.b64encode(raw.data).decode()
                else:
                    company_logo = f"data:image/png;base64,{raw}"
    except Exception:
        pass

    # Step 5 — available companies + fiscal localization cache (best-effort)
    company_ids_json = None
    try:
        companies = await detect_company_localizations(client, odoo_version)
        if companies:
            company_ids_json = dump_company_cache(companies)
            first = companies[0]
            company_name = company_name or first.get("name") or None
            company_city = company_city or first.get("city") or None
    except Exception:
        try:
            all_companies = await loop.run_in_executor(
                None,
                lambda: client.search_read("res.company", [], ["id", "name"], limit=50)
            )
            company_ids_json = json.dumps([{"id": c["id"], "name": c["name"]} for c in all_companies])
        except Exception:
            pass

    # Step 6 — user access / admin check (best-effort)
    access_info = None
    try:
        access_info = await _check_user_access(client, loop)
    except Exception:
        pass

    return {
        "steps": steps,
        "uid": uid,
        "odoo_version": odoo_version,
        "modules": modules,
        "module_count": len(modules),
        "db_name_suggestion": _suggest_db_name(url),
        "company_name": company_name,
        "company_city": company_city,
        "company_logo": company_logo,
        "company_ids": company_ids_json,
        "access_info": access_info,
    }


@router.post("/")
async def create_profile(body: ProfileCreate, session: AsyncSession = Depends(get_session)):
    existing = await session.execute(select(Profile).where(Profile.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Un projet avec ce nom existe déjà")
    profile = Profile(**{k: v for k, v in body.model_dump().items() if k != "api_key"})
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    store_profile_secrets(body.name, body.api_key)
    return profile


@router.get("/{profile_id}")
async def get_profile(profile_id: int, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    return profile


@router.patch("/{profile_id}")
async def update_profile(profile_id: int, body: ProfileUpdate, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    for k, v in body.model_dump(exclude_none=True).items():
        if k == "api_key":
            store_profile_secrets(profile.name, v)
        else:
            setattr(profile, k, v)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


@router.delete("/{profile_id}")
async def delete_profile(profile_id: int, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    delete_profile_secrets(profile.name)
    await session.delete(profile)
    await session.commit()
    return {"ok": True}


async def _check_user_access(client: OdooClient, loop) -> dict:
    """
    Returns access info for the authenticated Odoo user.
    Uses has_group() (public XML-RPC method) for group checks — avoids res.users
    field-level access restrictions on groups_id.
    """
    uid = await loop.run_in_executor(None, client.authenticate)
    log.info("check_user_access: authenticated uid=%s db=%s", uid, client.db)

    # ── User name + company_ids via direct read ──────────────────
    user_name = ""
    accessible: list[int] = []
    try:
        records = await loop.run_in_executor(
            None,
            lambda: client._models.execute_kw(
                client.db, uid, client.api_key,
                "res.users", "read", [[uid]],
                {"fields": ["name", "company_ids"]}
            )
        )
        if records:
            r = records[0]
            user_name = r.get("name") or ""
            raw = r.get("company_ids") or []
            # XML-RPC returns a list of ints for Many2many
            accessible = [c if isinstance(c, int) else int(c[0]) for c in raw]
        log.info("check_user_access: user=%s companies=%s", user_name, accessible)
    except Exception as exc:
        log.warning("check_user_access: failed to read res.users: %s", exc)

    # ── Group membership — resolve via ir.model.data then check groups_id ──
    is_system = False
    is_admin = False
    try:
        # Fetch numeric IDs for the two groups we care about
        group_data = await loop.run_in_executor(
            None,
            lambda: client._models.execute_kw(
                client.db, uid, client.api_key,
                "ir.model.data", "search_read",
                [[["module", "=", "base"],
                  ["name", "in", ["group_system", "group_erp_manager"]],
                  ["model", "=", "res.groups"]]],
                {"fields": ["name", "res_id"], "limit": 10},
            )
        )
        name_to_id = {g["name"]: g["res_id"] for g in group_data}
        system_id  = name_to_id.get("group_system")
        admin_id   = name_to_id.get("group_erp_manager")

        # Search which of the target groups the current user belongs to (M2M reverse).
        # Avoids reading groups_id on res.users which was removed in some Odoo versions.
        target_ids = [gid for gid in [system_id, admin_id] if gid]
        if target_ids:
            matched = await loop.run_in_executor(
                None,
                lambda: client._models.execute_kw(
                    client.db, uid, client.api_key,
                    "res.groups", "search",
                    [[["id", "in", target_ids], ["users", "in", [uid]]]],
                    {},
                )
            )
            matched_set = set(matched)
            if system_id:
                is_system = system_id in matched_set
            if admin_id:
                is_admin = admin_id in matched_set and not is_system

        log.info("check_user_access: group check ok — is_system=%s is_admin=%s", is_system, is_admin)
    except Exception as exc:
        log.warning("check_user_access: group check failed (non-blocking): %s", exc)

    log.info("check_user_access: is_system=%s is_admin=%s", is_system, is_admin)
    return {
        "is_system": is_system,
        "is_admin": is_admin,
        "user_name": user_name,
        "accessible_company_ids": accessible,
        "checked_at": datetime.utcnow().isoformat(),
    }


def _get_client_from_profile(profile: Profile, env_id: str | None = None) -> OdooClient:
    fallback = {"db_url": profile.db_url, "db_name": profile.db_name, "login": profile.login, "odoo_version": profile.odoo_version}
    if env_id:
        try:
            envs = json.loads(profile.environments or "[]")
            env = next((e for e in envs if e.get("id") == env_id), None) or get_active_env_from_json(profile.environments, profile.active_env_id, fallback)
        except Exception:
            env = get_active_env_from_json(profile.environments, profile.active_env_id, fallback)
    else:
        env = get_active_env_from_json(profile.environments, profile.active_env_id, fallback)
    actual_env_id = env.get("id", "prod")
    api_key = get_active_api_key(profile.name, actual_env_id)
    if not api_key:
        raise HTTPException(400, "Aucune clé API enregistrée pour ce profil")
    url = _normalise_url(env.get("db_url") or profile.db_url)
    return OdooClient(url, env.get("db_name") or profile.db_name, env.get("login") or profile.login, api_key)


@router.get("/{profile_id}/apps")
async def get_profile_apps(profile_id: int, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Profil introuvable")
    client = _get_client_from_profile(profile)
    loop = asyncio.get_event_loop()
    try:
        apps = await loop.run_in_executor(None, client.get_installed_apps)
        return {"apps": apps}
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.post("/{profile_id}/test")
async def test_connection(profile_id: int, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    api_key = get_profile_api_key(profile.name)
    if not api_key:
        raise HTTPException(400, "Aucune clé API enregistrée pour ce projet")
    client = OdooClient(profile.db_url, profile.db_name, profile.login, api_key)
    try:
        uid = await asyncio.get_event_loop().run_in_executor(None, client.authenticate)
        return {"ok": True, "uid": uid}
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.post("/{profile_id}/check-access")
async def check_access(profile_id: int, session: AsyncSession = Depends(get_session)):
    """Check Odoo user access rights and persist the result on the profile."""
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    api_key = get_profile_api_key(profile.name)
    if not api_key:
        raise HTTPException(400, "Aucune clé API enregistrée pour ce projet")
    url = _normalise_url(profile.db_url)
    client = OdooClient(url, profile.db_name, profile.login, api_key)
    loop = asyncio.get_event_loop()
    try:
        info = await _check_user_access(client, loop)
        profile.user_access_info = json.dumps(info)
        try:
            companies = await detect_company_localizations(client, profile.odoo_version)
            if companies:
                profile.company_ids = dump_company_cache(merge_company_localizations(profile.company_ids, companies))
        except Exception:
            pass
        try:
            analysis = await analyze_technical_complexity(profile.name, profile.environments, client, profile.github_repo)
            profile.technical_complexity = dump_technical_complexity(analysis)
        except Exception:
            pass
        profile.updated_at = datetime.utcnow()
        session.add(profile)
        await session.commit()
        await session.refresh(profile)
        return info
    except Exception as exc:
        log.exception("check_access failed for profile %s", profile_id)
        raise HTTPException(400, str(exc))


@router.post("/{profile_id}/localization/refresh")
async def refresh_localization(profile_id: int, session: AsyncSession = Depends(get_session)):
    """Refresh cached fiscal localization metadata for all companies of a project."""
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    client = _get_client_from_profile(profile)
    fallback = {"odoo_version": profile.odoo_version}
    active_env = get_active_env_from_json(profile.environments, profile.active_env_id, fallback)
    version = active_env.get("odoo_version") or profile.odoo_version
    try:
        companies = await detect_company_localizations(client, version)
    except Exception as exc:
        raise HTTPException(400, f"Impossible de détecter la localisation : {exc}")
    if not companies:
        raise HTTPException(400, "Aucune société détectée sur l'instance Odoo")
    profile.company_ids = dump_company_cache(merge_company_localizations(profile.company_ids, companies))
    first = companies[0]
    profile.company_name = profile.company_name or first.get("name")
    profile.company_city = profile.company_city or first.get("city")
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return {"companies": companies, "company_ids": profile.company_ids}


@router.post("/{profile_id}/technical-complexity/refresh")
async def refresh_technical_complexity(profile_id: int, session: AsyncSession = Depends(get_session)):
    """Refresh cached Studio/custom-dev complexity signals for a project."""
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    client = None
    try:
        client = _get_client_from_profile(profile)
    except Exception:
        client = None
    analysis = await analyze_technical_complexity(profile.name, profile.environments, client, profile.github_repo)
    profile.technical_complexity = dump_technical_complexity(analysis)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return analysis


@router.post("/check-access-raw")
async def check_access_raw(body: AccessCheckRequest):
    """Check access using raw credentials (used from wizard before profile is saved)."""
    url = _normalise_url(body.db_url)
    client = OdooClient(url, body.db_name, body.login, body.api_key)
    loop = asyncio.get_event_loop()
    try:
        info = await _check_user_access(client, loop)
        return info
    except Exception as exc:
        raise HTTPException(400, str(exc))


# ── Project context ────────────────────────────────────────────────

class ContextSaveRequest(BaseModel):
    content: str


@router.get("/{profile_id}/context")
async def get_context(profile_id: int, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    return {"content": profile.project_context or ""}


@router.put("/{profile_id}/context")
async def save_context(profile_id: int, body: ContextSaveRequest, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    profile.project_context = body.content.strip() or None
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    await session.commit()
    return {"ok": True}


@router.post("/{profile_id}/context/auto-fill")
async def auto_fill_context(profile_id: int, session: AsyncSession = Depends(get_session)):
    """Use an AI model to generate project context notes from profile metadata."""
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")

    # Gather available info
    apps_list = ""
    try:
        client = _get_client_from_profile(profile)
        loop = asyncio.get_event_loop()
        apps = await loop.run_in_executor(None, client.get_installed_apps)
        apps_list = ", ".join(a["name"] for a in apps[:30]) if apps else ""
    except Exception:
        pass

    companies_str = ""
    if profile.company_ids:
        try:
            cos = json.loads(profile.company_ids)
            companies_str = ", ".join(c.get("name", "") for c in cos)
        except Exception:
            pass

    # Scan cloned repos for this profile — collect manifest summaries
    repo_info = ""
    try:
        envs_list = json.loads(profile.environments or "[]")
        repo_snippets: list[str] = []
        for env in envs_list:
            env_id = env.get("id", "")
            github_repo = env.get("github_repo")
            if not github_repo:
                continue
            repo_path = _repo_local_path(profile.name, env_id)
            if not (repo_path / ".git").exists():
                continue
            # Collect __manifest__.py files (max 10)
            manifest_contents: list[str] = []
            for manifest in list(repo_path.rglob("__manifest__.py"))[:10]:
                try:
                    text = manifest.read_text(encoding="utf-8", errors="replace")
                    rel = manifest.relative_to(repo_path)
                    manifest_contents.append(f"# {rel}\n{text[:800]}")
                except Exception:
                    pass
            if manifest_contents:
                repo_snippets.append(f"Dépôt {github_repo} (env: {env.get('name', env_id)}) :\n" + "\n\n".join(manifest_contents))
        if repo_snippets:
            repo_info = "\n\nCode source du projet (manifests des modules custom) :\n" + "\n\n---\n".join(repo_snippets)
    except Exception:
        pass

    profile_locale = "fr"
    assistant_language = "auto"
    try:
        from ..routes.settings import USER_PROFILE_FILE
        if USER_PROFILE_FILE.exists():
            user_settings = json.loads(USER_PROFILE_FILE.read_text())
            profile_locale = (user_settings.get("contextLanguage") or user_settings.get("language") or "fr")
            assistant_language = user_settings.get("assistantLanguage") or "auto"
    except Exception:
        pass

    if str(profile_locale).lower().startswith("en"):
        prompt = f"""You are an expert Odoo assistant. Generate a concise project context file that another AI assistant can use directly.

Goal:
- Anchor future AI answers in the actual client project.
- Avoid hallucinations by separating observed facts, assumptions, and missing information.
- Provide enough business context to choose between standard Odoo, configuration, Studio, and custom development.

Project data:
- Project name: {profile.name}
- Company: {profile.company_name or "unknown"}{", " + profile.company_city if profile.company_city else ""}
- URL: {profile.db_url}
- Odoo version: {profile.odoo_version or "unknown"}
- Detected companies: {companies_str or "unknown"}
- Installed modules: {apps_list or "unknown"}{repo_info}

Required format (Markdown, English, short bullets):
## Observed facts
- Client / company:
- Version / environment:
- Detected companies:
- Significant installed modules:
- Repositories or custom modules detected:

## Reasonable assumptions
- Likely activity:
- Likely critical business processes:
- Likely user roles involved:

## Modules and scopes to prioritize
| Domain | Modules / signals | Why it matters | To verify |
|---|---|---|---|

## Customizations and integrations
- Custom modules:
- Studio fields / models / views to look for:
- External integrations to confirm:

## Risks and watchpoints
- Data:
- Security / access rights:
- Performance:
- Migration / upgrade:

## Open questions for the consultant
- [ ] ...

## Consultant notes
- To be completed manually.

Rules:
- Do not invent facts. If you infer something, put it under **Reasonable assumptions**.
- If information is missing, write `To verify` or `Unknown`.
- Do not mention custom modules that are not present in the provided manifests.
- Keep the context short: around 80 lines maximum."""
    else:
        prompt = f"""Tu es un assistant expert Odoo. Génère un fichier de contexte projet concis, structuré et directement exploitable par un autre assistant IA.

Objectif du contexte :
- Orienter les futures réponses IA vers la réalité du projet client.
- Éviter les hallucinations en distinguant faits observés, hypothèses et informations manquantes.
- Donner assez de contexte métier pour choisir entre standard Odoo, configuration, Studio et développement custom.

Données du projet :
- Nom du projet : {profile.name}
- Société : {profile.company_name or "inconnue"}{", " + profile.company_city if profile.company_city else ""}
- URL : {profile.db_url}
- Version Odoo : {profile.odoo_version or "inconnue"}
- Sociétés détectées : {companies_str or "inconnue"}
- Modules installés : {apps_list or "inconnus"}{repo_info}

Format obligatoire (Markdown, français, bulletpoints courts) :
## Faits observés
- Client / société :
- Version / environnement :
- Sociétés détectées :
- Modules installés significatifs :
- Dépôts ou modules custom détectés :

## Hypothèses raisonnables
- Activité probable :
- Processus métier probablement critiques :
- Rôles utilisateurs probablement concernés :

## Modules et périmètres à prioriser
| Domaine | Modules / indices | Pourquoi c'est prioritaire | À vérifier |
|---|---|---|---|

## Customisations et intégrations
- Modules custom :
- Champs / modèles / vues Studio à rechercher :
- Intégrations externes à confirmer :

## Risques et points d'attention
- Données :
- Sécurité / droits :
- Performance :
- Migration / montée de version :

## Questions ouvertes pour le consultant
- [ ] ...

## Notes consultant
- À compléter manuellement.

Règles :
- Ne pas inventer de fait. Si tu déduis quelque chose, mets-le dans **Hypothèses raisonnables**.
- Si une information manque, écris `À vérifier` ou `Inconnu`.
- Ne mentionne pas de module custom qui n'apparaît pas dans les manifests fournis.
- Garde le contexte court : environ 80 lignes maximum."""

    # Find a working AI key
    from ..routes.ai import _ai_key, _exchange_copilot_token
    from ...services.ai_service import stream_chat

    for provider in ("claude", "openai", "gemini", "copilot", "github"):
        key = _ai_key(provider)
        if not key:
            continue
        if provider == "copilot":
            try:
                key = await _exchange_copilot_token(key)
            except Exception:
                continue
        try:
            result_parts = []
            async for evt in stream_chat(
                provider, key, None, None, None,
                [{"role": "user", "content": prompt}],
                None, "", None, None, None,
                response_language=assistant_language if assistant_language in {"fr", "en"} else ("en" if str(profile_locale).lower().startswith("en") else "fr")
            ):
                if evt.get("type") == "text":
                    result_parts.append(evt.get("content", ""))
            generated = "".join(result_parts).strip()
            if generated:
                return {"content": generated}
        except Exception as exc:
            log.warning("auto_fill_context: provider %s failed: %s", provider, exc)
            continue

    raise HTTPException(503, "Aucun fournisseur IA disponible — configurez une clé API dans les Paramètres.")


# ── Environment CRUD ───────────────────────────────────────────────

@router.post("/{profile_id}/environments")
async def add_environment(profile_id: int, body: EnvCreate, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    try:
        envs: list[dict] = json.loads(profile.environments or "[]")
    except Exception:
        envs = []
    if any(e.get("id") == body.id for e in envs):
        raise HTTPException(409, f"Un environnement '{body.id}' existe déjà")
    entry = {k: v for k, v in body.model_dump().items() if k != "api_key" and v is not None}
    entry["db_url"] = _normalise_url(entry["db_url"])
    envs.append(entry)
    profile.environments = json.dumps(envs)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    store_env_api_key(profile.name, body.id, body.api_key)
    return profile


@router.patch("/{profile_id}/environments/{env_id}")
async def update_environment(profile_id: int, env_id: str, body: EnvUpdate, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    try:
        envs: list[dict] = json.loads(profile.environments or "[]")
    except Exception:
        envs = []
    idx = next((i for i, e in enumerate(envs) if e.get("id") == env_id), None)
    if idx is None:
        raise HTTPException(404, f"Environnement '{env_id}' introuvable")
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items() if k != "api_key"}
    if "db_url" in updates:
        updates["db_url"] = _normalise_url(updates["db_url"])
    envs[idx].update(updates)
    profile.environments = json.dumps(envs)
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    if body.api_key:
        store_env_api_key(profile.name, env_id, body.api_key)
    return profile


@router.delete("/{profile_id}/environments/{env_id}")
async def delete_environment(profile_id: int, env_id: str, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    try:
        envs: list[dict] = json.loads(profile.environments or "[]")
    except Exception:
        envs = []
    envs = [e for e in envs if e.get("id") != env_id]
    profile.environments = json.dumps(envs)
    if profile.active_env_id == env_id:
        profile.active_env_id = envs[0]["id"] if envs else None
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    await session.commit()
    delete_env_api_key(profile.name, env_id)
    return {"ok": True}


@router.post("/{profile_id}/environments/{env_id}/activate")
async def activate_environment(profile_id: int, env_id: str, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    try:
        envs: list[dict] = json.loads(profile.environments or "[]")
    except Exception:
        envs = []
    if not any(e.get("id") == env_id for e in envs):
        raise HTTPException(404, f"Environnement '{env_id}' introuvable")
    profile.active_env_id = env_id
    profile.updated_at = datetime.utcnow()
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


@router.post("/{profile_id}/environments/{env_id}/test")
async def test_environment(profile_id: int, env_id: str, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    try:
        envs: list[dict] = json.loads(profile.environments or "[]")
    except Exception:
        envs = []
    env = next((e for e in envs if e.get("id") == env_id), None)
    if not env:
        raise HTTPException(404, f"Environnement '{env_id}' introuvable")
    api_key = get_active_api_key(profile.name, env_id)
    if not api_key:
        raise HTTPException(400, "Aucune clé API pour cet environnement")
    url = _normalise_url(env["db_url"])
    client = OdooClient(url, env["db_name"], env["login"], api_key)
    loop = asyncio.get_event_loop()
    try:
        uid = await loop.run_in_executor(None, client.authenticate)
        return {"ok": True, "uid": uid}
    except Exception as exc:
        raise HTTPException(400, str(exc))


# ── Repository (per-environment) ──────────────────────────────────

def _repo_local_path(profile_name: str, env_id: str) -> Path:
    return Path.home() / ".odoo-consultant" / "repos" / profile_name / env_id


@router.get("/{profile_id}/environments/{env_id}/repo")
async def get_env_repo_status(profile_id: int, env_id: str, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    try:
        envs: list[dict] = json.loads(profile.environments or "[]")
    except Exception:
        envs = []
    env = next((e for e in envs if e.get("id") == env_id), None)
    if not env:
        raise HTTPException(404, f"Environnement '{env_id}' introuvable")

    github_repo = env.get("github_repo")
    if not github_repo:
        return {"github_repo": None, "cloned": False}

    repo_path = _repo_local_path(profile.name, env_id)
    if not (repo_path / ".git").exists():
        return {"github_repo": github_repo, "cloned": False, "local_path": str(repo_path)}

    try:
        import git as gitlib
        repo = gitlib.Repo(repo_path)
        head = repo.head.commit
        return {
            "github_repo": github_repo,
            "cloned": True,
            "local_path": str(repo_path),
            "head": head.hexsha[:8],
            "message": head.message.strip().split("\n")[0][:80],
            "date": head.committed_datetime.isoformat(),
        }
    except Exception as exc:
        return {"github_repo": github_repo, "cloned": True, "local_path": str(repo_path), "error": str(exc)}


class RepoSyncRequest(BaseModel):
    github_repo: Optional[str] = None   # overrides stored value (used before saving env)
    repo_branch: Optional[str] = None


class WorkspaceOpenRequest(BaseModel):
    env_id: Optional[str] = None


def _safe_workspace_name(name: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "-" for ch in name.strip())
    return safe.strip("-") or "odoo-project"


def _vscode_command(workspace_path: Path) -> list[str]:
    if code := shutil.which("code"):
        return [code, str(workspace_path)]
    if codium := shutil.which("codium"):
        return [codium, str(workspace_path)]
    if sys.platform == "darwin":
        return ["open", "-a", "Visual Studio Code", str(workspace_path)]
    raise HTTPException(400, "VS Code introuvable. Installez la commande 'code' ou ouvrez le workspace manuellement.")


def _workspace_env(profile: Profile, env_id: Optional[str]) -> dict:
    try:
        envs: list[dict] = json.loads(profile.environments or "[]")
    except Exception:
        envs = []
    selected_id = env_id or profile.active_env_id or (envs[0].get("id") if envs else None)
    env = next((e for e in envs if e.get("id") == selected_id), None)
    if env:
        return env
    return {
        "id": "prod",
        "name": "Production",
        "odoo_version": profile.odoo_version,
        "github_repo": profile.github_repo,
        "repo_branch": profile.default_branch,
    }


@router.post("/{profile_id}/vscode")
async def open_profile_workspace(profile_id: int, body: WorkspaceOpenRequest = WorkspaceOpenRequest(), session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")

    env = _workspace_env(profile, body.env_id)
    env_id = env.get("id") or "prod"
    version = env.get("odoo_version") or profile.odoo_version
    github_repo = env.get("github_repo") or profile.github_repo

    folders: list[dict[str, str]] = []
    missing: list[str] = []
    if version:
        source_base = Path.home() / ".odoo-consultant" / "sources"
        community = source_base / version
        enterprise = source_base / f"{version}-enterprise"
        if community.is_dir():
            folders.append({"name": f"Odoo {version} Community", "path": str(community)})
        else:
            missing.append(f"sources Odoo {version} Community")
        if enterprise.is_dir():
            folders.append({"name": f"Odoo {version} Enterprise", "path": str(enterprise)})

    repo_path = _repo_local_path(profile.name, env_id)
    if github_repo:
        if (repo_path / ".git").exists():
            folders.append({"name": f"{profile.name} custom ({env.get('name') or env_id})", "path": str(repo_path)})
        else:
            missing.append(f"repo {github_repo}")

    if not folders:
        raise HTTPException(400, "Aucune source Odoo ou repo local disponible. Installez les sources et/ou clonez le repo de l'environnement.")

    workspace_dir = Path.home() / ".odoo-consultant" / "workspaces"
    workspace_dir.mkdir(parents=True, exist_ok=True)
    workspace_path = workspace_dir / f"{_safe_workspace_name(profile.name)}-{_safe_workspace_name(env_id)}.code-workspace"
    workspace = {
        "folders": folders,
        "settings": {
            "files.exclude": {
                "**/.git": True,
                "**/__pycache__": True,
                "**/.pytest_cache": True,
                "**/node_modules": True,
            },
            "search.exclude": {
                "**/.git": True,
                "**/__pycache__": True,
                "**/node_modules": True,
            },
        },
    }
    workspace_path.write_text(json.dumps(workspace, indent=2, ensure_ascii=False), encoding="utf-8")
    subprocess.Popen(_vscode_command(workspace_path), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {
        "ok": True,
        "workspace": str(workspace_path),
        "folders": folders,
        "missing": missing,
    }


@router.post("/{profile_id}/environments/{env_id}/repo/sync")
async def sync_env_repo(profile_id: int, env_id: str, body: RepoSyncRequest = RepoSyncRequest(), session: AsyncSession = Depends(get_session)):
    """Clone or pull the GitHub repo for this environment — returns SSE stream."""
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Projet introuvable")
    try:
        envs: list[dict] = json.loads(profile.environments or "[]")
    except Exception:
        envs = []
    env = next((e for e in envs if e.get("id") == env_id), None)
    if not env:
        raise HTTPException(404, f"Environnement '{env_id}' introuvable")

    # Body values take priority (allows syncing before saving env changes)
    github_repo = body.github_repo or env.get("github_repo")
    if not github_repo:
        raise HTTPException(400, "Aucun dépôt GitHub configuré pour cet environnement")

    repo_branch = body.repo_branch or env.get("repo_branch") or "main"
    repo_url = f"git@github.com:{github_repo}.git"
    repo_path = _repo_local_path(profile.name, env_id)
    is_clone = not (repo_path / ".git").exists()

    async def generate():
        # A client repo frequently vendors its addons (OCA modules, shared
        # libraries) as Git submodules. Clone recursively, and after a pull
        # re-sync the submodules so they track the new superproject commit.
        if is_clone:
            repo_path.mkdir(parents=True, exist_ok=True)
            steps = [(
                f"Clonage de {github_repo} (branche {repo_branch})",
                ["git", "clone", "--progress", "--depth=1", "--branch", repo_branch,
                 "--recurse-submodules", "--shallow-submodules", repo_url, str(repo_path)],
            )]
        else:
            steps = [
                (f"Mise à jour de {github_repo}",
                 ["git", "-C", str(repo_path), "pull", "--progress"]),
                ("Synchronisation des submodules Git",
                 ["git", "-C", str(repo_path), "submodule", "update",
                  "--init", "--recursive", "--depth", "1", "--progress"]),
            ]

        returncode = 0
        for label, cmd in steps:
            yield f"data: {json.dumps({'type': 'start', 'msg': f'⟳ {label}'}, ensure_ascii=False)}\n\n"
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env={**_os.environ, "GIT_TERMINAL_PROMPT": "0"},
            )
            async for raw in proc.stdout:
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                if line:
                    yield f"data: {json.dumps({'type': 'log', 'msg': line}, ensure_ascii=False)}\n\n"
            await proc.wait()
            returncode = proc.returncode or 0
            if returncode != 0:
                break

        if returncode == 0:
            yield f"data: {json.dumps({'type': 'done', 'msg': '✓ Terminé'}, ensure_ascii=False)}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'error', 'msg': f'Erreur git (code {returncode})'}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'end'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
