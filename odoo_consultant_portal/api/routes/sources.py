from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ...services.source_manager import (
    SUPPORTED_VERSIONS, detect_ssh_keys, test_github_ssh,
    clone_or_pull, get_git_status, get_recent_commits,
    COMMUNITY_REMOTE, ENTERPRISE_REMOTE,
)

router = APIRouter()


class SyncRequest(BaseModel):
    version: str
    path: str
    community: bool = True
    enterprise: bool = False


@router.get("/versions")
async def list_versions():
    return {"versions": SUPPORTED_VERSIONS}


@router.get("/ssh-keys")
async def ssh_keys():
    return {"keys": detect_ssh_keys()}


@router.get("/test-github-ssh")
async def github_ssh():
    return {"accessible": test_github_ssh()}


@router.post("/sync")
async def sync_source(req: SyncRequest):
    if req.version not in SUPPORTED_VERSIONS and not req.version.startswith("custom"):
        raise HTTPException(400, f"Unsupported version: {req.version}")
    results = []
    if req.community:
        from pathlib import Path
        result = clone_or_pull(COMMUNITY_REMOTE, Path(req.path) / "community", req.version)
        results.append({"type": "community", **result})
    if req.enterprise:
        if not test_github_ssh():
            raise HTTPException(403, "No SSH access to GitHub for Enterprise")
        from pathlib import Path
        result = clone_or_pull(ENTERPRISE_REMOTE, Path(req.path) / "enterprise", req.version)
        results.append({"type": "enterprise", **result})
    return {"results": results}


@router.get("/status")
async def git_status(path: str):
    return get_git_status(path)


@router.get("/commits")
async def commits(path: str, count: int = 10):
    return {"commits": get_recent_commits(path, count)}
