from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel


class SourceVersion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    version: str = Field(index=True)
    label: str
    community_path: Optional[str] = None
    enterprise_path: Optional[str] = None
    is_custom: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Profile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    odoo_sh_url: Optional[str] = None
    db_url: str
    db_name: str
    login: str
    github_repo: Optional[str] = None
    default_branch: Optional[str] = None
    odoo_version: Optional[str] = None
    # JSON array: [{"name":"staging","db_name":"...","db_url":"...","branch":"..."}]
    environments: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    local_path: str
    remote_url: Optional[str] = None
    profile_id: Optional[int] = Field(default=None, foreign_key="profile.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PromptHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: datetime = Field(default_factory=datetime.utcnow)
    profile_name: Optional[str] = None
    mode: str
    prompt: str
    result_summary: Optional[str] = None
    exported_file_path: Optional[str] = None
    status: str = "pending"
    duration_ms: Optional[int] = None
