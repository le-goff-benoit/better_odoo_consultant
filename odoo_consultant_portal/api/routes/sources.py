import asyncio
import json
import re
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ...services.source_manager import (
    SUPPORTED_VERSIONS, detect_ssh_keys, test_github_ssh,
    get_git_status, get_recent_commits,
    COMMUNITY_REMOTE, ENTERPRISE_REMOTE,
)

router = APIRouter()


class SyncRequest(BaseModel):
    version: str
    path: str
    community: bool = True
    enterprise: bool = False


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _parse_git_line(line: str) -> dict:
    """Turn a raw git progress line into a structured event."""
    line = line.strip()
    # Receiving objects:  67% (12345/18432), 45.23 MiB | 3.45 MiB/s
    m = re.search(r"(Receiving objects|Resolving deltas|Checking out files):\s+(\d+)%\s+\((\d+)/(\d+)\)", line)
    if m:
        label, pct, done, total = m.group(1), int(m.group(2)), m.group(3), m.group(4)
        speed_m = re.search(r"([\d.]+)\s*MiB/s", line)
        speed = f" — {speed_m.group(1)} MiB/s" if speed_m else ""
        return {"type": "progress", "pct": pct, "label": f"{label} : {pct}%  ({done}/{total}){speed}"}
    if line:
        return {"type": "log", "msg": line}
    return {}


async def _stream_git(cmd: list[str], label: str):
    """Async generator that runs a git command and yields SSE dicts."""
    yield {"type": "start", "msg": f"⟳ {label}"}
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,   # merge so we catch all output
        env={**__import__("os").environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    async for raw in proc.stdout:
        line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
        evt = _parse_git_line(line)
        if evt:
            yield evt
    await proc.wait()
    if proc.returncode == 0:
        yield {"type": "done", "msg": "✓ Terminé"}
    else:
        yield {"type": "error", "msg": f"git a retourné le code {proc.returncode}"}


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
    ssh_dir = Path.home() / ".ssh"
    ssh_dir.mkdir(mode=0o700, exist_ok=True)
    key_path = ssh_dir / "id_ed25519_odoo_portal"
    pub_path = Path(str(key_path) + ".pub")

    if key_path.exists():
        public_key = pub_path.read_text().strip() if pub_path.exists() else ""
        return {"created": False, "key_path": str(key_path), "public_key": public_key}

    try:
        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-C", comment, "-f", str(key_path), "-N", ""],
            check=True, capture_output=True,
        )
        return {"created": True, "key_path": str(key_path), "public_key": pub_path.read_text().strip()}
    except subprocess.CalledProcessError as exc:
        raise HTTPException(500, f"ssh-keygen failed: {exc.stderr.decode()}")


@router.post("/sync-stream")
async def sync_source_stream(req: SyncRequest):
    """Stream git clone/pull progress as Server-Sent Events."""
    if req.version not in SUPPORTED_VERSIONS and not req.version.startswith("custom"):
        raise HTTPException(400, f"Version non supportée : {req.version}")

    base = Path(req.path).expanduser().resolve()

    async def generate():
        jobs: list[tuple[str, list[str]]] = []

        if req.community:
            comm_path = base
            if (comm_path / ".git").exists():
                cmd = ["git", "-C", str(comm_path), "pull", "--progress", "origin", req.version]
                label = f"Mise à jour Community {req.version}"
            else:
                comm_path.mkdir(parents=True, exist_ok=True)
                cmd = ["git", "clone", "--progress", "--depth=1",
                       "--branch", req.version, COMMUNITY_REMOTE, str(comm_path)]
                label = f"Téléchargement Community {req.version}"
            jobs.append((label, cmd))

        if req.enterprise:
            if not test_github_ssh():
                yield _sse({"type": "error", "msg": "Pas d'accès SSH à GitHub — Enterprise non disponible."})
            else:
                ent_path = base.parent / (base.name + "-enterprise")
                if (ent_path / ".git").exists():
                    cmd = ["git", "-C", str(ent_path), "pull", "--progress", "origin", req.version]
                    label = f"Mise à jour Enterprise {req.version}"
                else:
                    ent_path.mkdir(parents=True, exist_ok=True)
                    cmd = ["git", "clone", "--progress", "--depth=1",
                           "--branch", req.version, ENTERPRISE_REMOTE, str(ent_path)]
                    label = f"Téléchargement Enterprise {req.version}"
                jobs.append((label, cmd))

        for label, cmd in jobs:
            async for evt in _stream_git(cmd, label):
                yield _sse(evt)
            yield _sse({"type": "separator"})

        yield _sse({"type": "end"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Keep old /sync for backwards compat (non-streaming)
@router.post("/sync")
async def sync_source(req: SyncRequest):
    if req.version not in SUPPORTED_VERSIONS and not req.version.startswith("custom"):
        raise HTTPException(400, f"Version non supportée : {req.version}")
    from ...services.source_manager import clone_or_pull
    results = []
    if req.community:
        result = clone_or_pull(COMMUNITY_REMOTE, base := Path(req.path).expanduser(), req.version)
        results.append({"type": "community", **result})
    if req.enterprise:
        if not test_github_ssh():
            raise HTTPException(403, "Pas d'accès SSH GitHub pour Enterprise")
        ent_path = Path(req.path).expanduser().parent / (Path(req.path).name + "-enterprise")
        result = clone_or_pull(ENTERPRISE_REMOTE, ent_path, req.version)
        results.append({"type": "enterprise", **result})
    return {"results": results}


@router.get("/status")
async def git_status(path: str):
    return get_git_status(path)


@router.get("/commits")
async def commits(path: str, count: int = 10):
    return {"commits": get_recent_commits(path, count)}
