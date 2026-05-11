from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...core.models import Profile
from ...services.odoo_client import OdooClient
from ...services.profile_manager import get_profile_api_key
from ...services import history_service
import time

router = APIRouter()


def _get_client(profile: Profile) -> OdooClient:
    api_key = get_profile_api_key(profile.name)
    if not api_key:
        raise HTTPException(400, "No API key for profile")
    return OdooClient(profile.db_url, profile.db_name, profile.login, api_key)


class SearchRequest(BaseModel):
    profile_id: int
    model: str
    domain: list = []
    fields: Optional[list[str]] = None
    limit: int = 80
    offset: int = 0
    order: str = ""
    export_format: Optional[str] = None


@router.post("/search")
async def search(req: SearchRequest, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, req.profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    client = _get_client(profile)
    t0 = time.time()
    try:
        records = client.search_read(req.model, req.domain, req.fields, req.limit, req.offset, req.order)
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
            client.export_excel(records, path)
            export_path = path
        await history_service.add_entry(
            session,
            profile_name=profile.name,
            mode="search",
            prompt=f"{req.model} {req.domain}",
            result_summary=f"{len(records)} records",
            exported_file_path=export_path,
            status="done",
            duration_ms=duration_ms,
        )
        return {"records": records, "count": len(records), "export": result_text, "export_path": export_path}
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.get("/fields")
async def fields(profile_id: int, model: str, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    client = _get_client(profile)
    try:
        return client.fields_get(model)
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.get("/modules")
async def modules(profile_id: int, session: AsyncSession = Depends(get_session)):
    profile = await session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    client = _get_client(profile)
    try:
        return {"modules": client.get_installed_modules()}
    except Exception as exc:
        raise HTTPException(400, str(exc))
