import asyncio
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...core.models import Profile
from ...services.profile_manager import store_profile_secrets, get_profile_api_key, delete_profile_secrets
from ...services.odoo_client import OdooClient

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
    company_name: Optional[str] = None
    company_city: Optional[str] = None
    company_logo: Optional[str] = None


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

@router.get("/")
async def list_profiles(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Profile))
    return result.scalars().all()


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
        odoo_version = f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else server_version_raw
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
