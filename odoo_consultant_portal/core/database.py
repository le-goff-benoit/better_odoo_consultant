from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from .config import settings

engine = create_async_engine(settings.db_url, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Columns added after initial release — applied with ALTER TABLE if missing
_MIGRATIONS = [
    ("profile", "environments",    "TEXT"),
    ("profile", "company_name",    "TEXT"),
    ("profile", "company_city",    "TEXT"),
    ("profile", "company_logo",    "TEXT"),
    ("profile", "company_ids",     "TEXT"),
    ("profile", "api_key_expires",     "TEXT"),
    ("profile", "selected_company_id", "INTEGER"),
    ("profile", "user_access_info",    "TEXT"),
    ("profile", "project_context",     "TEXT"),
    ("profile", "active_env_id",       "TEXT"),
]


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        # Add missing columns without dropping existing data
        for table, column, col_type in _MIGRATIONS:
            try:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            except Exception:
                pass  # column already exists


async def get_session():
    async with AsyncSessionLocal() as session:
        yield session
