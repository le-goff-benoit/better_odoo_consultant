import asyncio
import time
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...core.models import Profile
from ...services.odoo_client import OdooClient
from ...services.profile_manager import get_active_env_from_json, get_active_api_key
from ...services import history_service

router = APIRouter()

QUERY_PAGE_SIZE = 1000


def _get_client(profile: Profile) -> OdooClient:
    fallback = {"db_url": profile.db_url, "db_name": profile.db_name, "login": profile.login}
    env = get_active_env_from_json(profile.environments, profile.active_env_id, fallback)
    api_key = get_active_api_key(profile.name, env.get("id", "prod"))
    if not api_key:
        raise HTTPException(400, "Aucune clé API enregistrée pour ce profil")
    return OdooClient(env.get("db_url") or profile.db_url, env.get("db_name") or profile.db_name, env.get("login") or profile.login, api_key)


class SearchRequest(BaseModel):
    profile_id: int
    model: str
    domain: list = []
    fields: Optional[list[str]] = None
    limit: Optional[int] = Field(default=None, ge=0)
    offset: int = 0
    order: str = ""
    export_format: Optional[str] = None


async def _fetch_records_paginated(client: OdooClient, req: SearchRequest) -> tuple[list[dict], int, int, bool]:
    loop = asyncio.get_event_loop()
    total_count = await loop.run_in_executor(
        None,
        lambda: client.search_count(req.model, req.domain),
    )
    target_count = max(total_count - req.offset, 0)
    if req.limit and req.limit > 0:
        target_count = min(target_count, req.limit)
    records = []
    pages_fetched = 0
    while len(records) < target_count:
        page_limit = min(QUERY_PAGE_SIZE, target_count - len(records))
        page_offset = req.offset + len(records)
        page = await loop.run_in_executor(
            None,
            lambda page_limit=page_limit, page_offset=page_offset: client.search_read(
                req.model, req.domain, req.fields, page_limit, page_offset, req.order),
        )
        pages_fetched += 1
        if not page:
            break
        records.extend(page)
        if len(page) < page_limit:
            break
    truncated = bool(req.limit and req.limit > 0 and total_count > req.offset + len(records))
    return records, total_count, pages_fetched, truncated


@router.post("/search")
async def search(req: SearchRequest, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, req.profile_id)
    if not profile:
        raise HTTPException(404, "Profil introuvable")
    client = _get_client(profile)
    loop = asyncio.get_event_loop()
    t0 = time.time()
    try:
        records, total_count, pages_fetched, truncated = await _fetch_records_paginated(client, req)
        duration_ms = int((time.time() - t0) * 1000)
        export_path = None
        result_text = None
        if req.export_format == "markdown":
            result_text = client.export_markdown(records)
        elif req.export_format == "csv":
            result_text = client.export_csv(records)
        elif req.export_format == "excel":
            from ...core.config import settings
            import datetime
            path = str(settings.data_dir / f"export_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx")
            await loop.run_in_executor(None, lambda: client.export_excel(records, path))
            export_path = path
        await history_service.add_entry(
            session,
            profile_name=profile.name,
            mode="search",
            prompt=f"{req.model} {req.domain}",
            result_summary=f"{len(records)} enregistrements",
            exported_file_path=export_path,
            status="done",
            duration_ms=duration_ms,
        )
        warning = None
        if truncated:
            warning = (
                f"Résultat limité à {len(records)} enregistrements sur {total_count}. "
                "Affinez le domaine si vous devez cibler un sous-ensemble précis."
            )
        note = None
        if pages_fetched > 1:
            note = (
                f"{len(records)} enregistrements récupérés en {pages_fetched} "
                f"appels paginés de {QUERY_PAGE_SIZE} maximum."
            )
        return {
            "records": records,
            "count": len(records),
            "total_count": total_count,
            "truncated": truncated,
            "page_size": QUERY_PAGE_SIZE,
            "pages_fetched": pages_fetched,
            "warning": warning,
            "note": note,
            "export": result_text,
            "export_path": export_path,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.get("/fields")
async def fields(profile_id: int, model: str, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Profil introuvable")
    client = _get_client(profile)
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, lambda: client.fields_get(model))
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.get("/modules")
async def modules(profile_id: int, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Profil introuvable")
    client = _get_client(profile)
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, client.get_installed_modules)
        return {"modules": result}
    except Exception as exc:
        raise HTTPException(400, str(exc))
