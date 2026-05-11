from datetime import datetime
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..core.models import PromptHistory


async def add_entry(session: AsyncSession, **kwargs) -> PromptHistory:
    entry = PromptHistory(**kwargs)
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def list_entries(session: AsyncSession, limit: int = 50) -> list[PromptHistory]:
    result = await session.execute(
        select(PromptHistory).order_by(PromptHistory.date.desc()).limit(limit)
    )
    return result.scalars().all()


async def get_entry(session: AsyncSession, entry_id: int) -> PromptHistory | None:
    return await session.get(PromptHistory, entry_id)
