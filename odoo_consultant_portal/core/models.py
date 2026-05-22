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
    company_name: Optional[str] = None
    company_city: Optional[str] = None
    company_logo: Optional[str] = Field(default=None)  # data URI base64
    company_ids: Optional[str] = Field(default=None)        # JSON: [{"id":1,"name":"..."}]
    selected_company_id: Optional[int] = Field(default=None)
    api_key_expires: Optional[str] = None                    # format ISO date: "2026-12-31"
    user_access_info: Optional[str] = Field(default=None)    # JSON: {is_system,is_admin,user_name,accessible_company_ids,checked_at}
    project_context: Optional[str] = Field(default=None)     # Free-text context notes for this project
    technical_complexity: Optional[str] = Field(default=None) # JSON: Studio / custom dev complexity analysis
    active_env_id: Optional[str] = Field(default=None)       # ID of the active environment (null = first env = prod)
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


class CreatorRequest(SQLModel, table=True):
    """One Studio-style modification request handled by the Creator tool.

    A row is persisted once a request reaches a terminal state — applied,
    failed or rejected — so the Creator never lets the user chain unvalidated
    modifications and keeps an audit trail of every live write.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: Optional[int] = Field(default=None, foreign_key="profile.id")
    profile_name: Optional[str] = None
    env_id: Optional[str] = None
    env_label: Optional[str] = None
    company_id: Optional[int] = None
    request_text: str
    instructions: Optional[str] = None        # JSON array of follow-up instructions
    functional_analysis: Optional[str] = None
    technical_analysis: Optional[str] = None
    changeset: Optional[str] = None           # JSON array of operations
    apply_result: Optional[str] = None        # JSON: per-operation execution result
    documentation: Optional[str] = None       # Markdown recap written by the AI
    status: str = "analyzed"                  # analyzed | applied | failed | rejected
    provider: Optional[str] = None
    model: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
