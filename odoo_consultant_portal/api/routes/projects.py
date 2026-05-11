from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.database import get_session
from ...core.models import Project
from ...services import project_manager

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    local_path: str
    remote_url: Optional[str] = None
    profile_id: Optional[int] = None


@router.get("/")
async def list_projects(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Project))
    return result.scalars().all()


@router.post("/")
async def create_project(body: ProjectCreate, session: AsyncSession = Depends(get_session)):
    project = Project(**body.model_dump())
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


@router.post("/{project_id}/clone")
async def clone(project_id: int, session: AsyncSession = Depends(get_session)):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if not project.remote_url:
        raise HTTPException(400, "No remote URL set")
    try:
        result = project_manager.clone_project(project.remote_url, project.local_path)
        return result
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.post("/{project_id}/pull")
async def pull(project_id: int, branch: Optional[str] = None, session: AsyncSession = Depends(get_session)):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    try:
        return project_manager.pull_project(project.local_path, branch)
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.get("/{project_id}/branches")
async def branches(project_id: int, session: AsyncSession = Depends(get_session)):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return {"branches": project_manager.list_branches(project.local_path)}


@router.get("/{project_id}/commits")
async def commits(project_id: int, count: int = 10, session: AsyncSession = Depends(get_session)):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return {"commits": project_manager.recent_commits(project.local_path, count)}


@router.post("/{project_id}/open")
async def open_project(project_id: int, session: AsyncSession = Depends(get_session)):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    project_manager.open_path(project.local_path)
    return {"ok": True}
