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
from ...services.odoo_pagination import DEFAULT_MAX_RECORDS, DEFAULT_PAGE_SIZE, search_read_bounded

router = APIRouter()

QUERY_PAGE_SIZE = DEFAULT_PAGE_SIZE


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
    page_size: int = Field(default=DEFAULT_PAGE_SIZE, ge=1)
    max_records: int = Field(default=DEFAULT_MAX_RECORDS, ge=1)
    offset: int = 0
    order: str = ""
    export_format: Optional[str] = None


async def _fetch_records_paginated(client: OdooClient, req: SearchRequest) -> tuple[list[dict], dict]:
    loop = asyncio.get_event_loop()
    return await search_read_bounded(
        loop,
        client,
        req.model,
        req.domain,
        req.fields,
        limit=req.limit or 0,
        offset=req.offset,
        order=req.order,
        page_size=req.page_size,
        max_records=req.max_records,
        label="Résultat",
    )


@router.post("/search")
async def search(req: SearchRequest, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, req.profile_id)
    if not profile:
        raise HTTPException(404, "Profil introuvable")
    client = _get_client(profile)
    loop = asyncio.get_event_loop()
    t0 = time.time()
    try:
        records, meta = await _fetch_records_paginated(client, req)
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
        note = None
        if meta["pages_fetched"] > 1:
            note = (
                f"{len(records)} enregistrements récupérés en {meta['pages_fetched']} "
                f"appels paginés de {meta['page_size']} maximum."
            )
        return {
            "records": records,
            **meta,
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
