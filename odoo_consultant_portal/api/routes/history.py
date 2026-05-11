from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...services import history_service

router = APIRouter()


@router.get("/")
async def list_history(limit: int = 50, session: AsyncSession = Depends(get_session)):
    entries = await history_service.list_entries(session, limit)
    return entries


@router.get("/{entry_id}")
async def get_history_entry(entry_id: int, session: AsyncSession = Depends(get_session)):
    entry = await history_service.get_entry(session, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    return entry


@router.delete("/{entry_id}")
async def delete_entry(entry_id: int, session: AsyncSession = Depends(get_session)):
    entry = await history_service.get_entry(session, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    await session.delete(entry)
    await session.commit()
    return {"ok": True}
