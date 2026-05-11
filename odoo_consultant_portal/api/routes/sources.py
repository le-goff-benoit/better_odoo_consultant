import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
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


@router.post("/generate-ssh-key")
async def generate_ssh_key(comment: str = "odoo-consultant-portal"):
    """Generate a new ed25519 SSH key pair in ~/.ssh/."""
    ssh_dir = Path.home() / ".ssh"
    ssh_dir.mkdir(mode=0o700, exist_ok=True)
    key_path = ssh_dir / "id_ed25519_odoo_portal"

    if key_path.exists():
        # Already exists — just return the public key
        pub = (key_path.with_suffix(".pub") if key_path.suffix != ".pub" else key_path.parent / (key_path.name + ".pub"))
        pub_path = Path(str(key_path) + ".pub")
        public_key = pub_path.read_text().strip() if pub_path.exists() else ""
        return {"created": False, "key_path": str(key_path), "public_key": public_key}

    try:
        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-C", comment, "-f", str(key_path), "-N", ""],
            check=True, capture_output=True,
        )
        pub_path = Path(str(key_path) + ".pub")
        public_key = pub_path.read_text().strip()
        return {"created": True, "key_path": str(key_path), "public_key": public_key}
    except subprocess.CalledProcessError as exc:
        raise HTTPException(500, f"ssh-keygen failed: {exc.stderr.decode()}")


@router.post("/sync")
async def sync_source(req: SyncRequest):
    if req.version not in SUPPORTED_VERSIONS and not req.version.startswith("custom"):
        raise HTTPException(400, f"Unsupported version: {req.version}")
    results = []
    if req.community:
        result = clone_or_pull(COMMUNITY_REMOTE, Path(req.path), req.version)
        results.append({"type": "community", **result})
    if req.enterprise:
        if not test_github_ssh():
            raise HTTPException(403, "No SSH access to GitHub for Enterprise")
        ent_path = Path(req.path).parent / (Path(req.path).name + "-enterprise")
        result = clone_or_pull(ENTERPRISE_REMOTE, ent_path, req.version)
        results.append({"type": "enterprise", **result})
    return {"results": results}


@router.get("/status")
async def git_status(path: str):
    return get_git_status(path)


@router.get("/commits")
async def commits(path: str, count: int = 10):
    return {"commits": get_recent_commits(path, count)}
