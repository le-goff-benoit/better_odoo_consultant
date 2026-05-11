from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...core.models import Profile
from ...services.profile_manager import store_profile_secrets, get_profile_api_key, delete_profile_secrets
from ...services.odoo_client import OdooClient
from datetime import datetime

router = APIRouter()


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


class ProfileUpdate(BaseModel):
    odoo_sh_url: Optional[str] = None
    db_url: Optional[str] = None
    db_name: Optional[str] = None
    login: Optional[str] = None
    api_key: Optional[str] = None
    github_repo: Optional[str] = None
    default_branch: Optional[str] = None
    odoo_version: Optional[str] = None


class DetectRequest(BaseModel):
    db_url: str
    db_name: str
    login: str
    api_key: str


@router.get("/")
async def list_profiles(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Profile))
    return result.scalars().all()


@router.post("/detect")
async def detect_odoo_info(body: DetectRequest):
    """Connect to an Odoo instance and detect its version + installed modules."""
    client = OdooClient(body.db_url, body.db_name, body.login, body.api_key)
    try:
        uid = client.authenticate()
    except Exception as exc:
        raise HTTPException(400, f"Connexion échouée : {exc}")

    # Detect server version
    try:
        server_version: str = client._common.version().get("server_version", "")
        # Normalise to major.minor (e.g. "17.0.1.3" → "17.0")
        parts = server_version.split(".")
        odoo_version = f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else server_version
    except Exception:
        odoo_version = None

    # List installed modules
    try:
        modules = client.search_read(
            "ir.module.module",
            [["state", "=", "installed"]],
            ["name", "shortdesc", "installed_version"],
            limit=500,
        )
    except Exception:
        modules = []

    return {
        "uid": uid,
        "odoo_version": odoo_version,
        "modules": modules,
        "module_count": len(modules),
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
        uid = client.authenticate()
        return {"ok": True, "uid": uid}
    except Exception as exc:
        raise HTTPException(400, str(exc))
