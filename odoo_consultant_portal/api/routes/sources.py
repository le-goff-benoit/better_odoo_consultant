import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ...services.source_manager import (
    SUPPORTED_VERSIONS, VERSION_RE, detect_ssh_keys, test_github_ssh,
    COMMUNITY_REMOTE, ENTERPRISE_REMOTE,
)

router = APIRouter()

SOURCES_BASE = Path.home() / ".odoo-consultant" / "sources"


def _migrate_sources_dir() -> None:
    """Move ~/odoo-sources/ → ~/.odoo-consultant/sources/ once if needed."""
    old = SOURCES_BASE
    if old.exists() and not SOURCES_BASE.exists():
        import shutil
        SOURCES_BASE.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old), str(SOURCES_BASE))


def _branch_for_version(version: str) -> str:
    """Return the Git branch name for a given Odoo version string.
    Major releases (X.0) use the version directly; intermediate/saas releases (X.Y where Y>0) use saas-X.Y.
    """
    parts = version.split('.')
    if len(parts) == 2 and parts[1] != '0':
        return f"saas-{version}"
    return version


class SyncRequest(BaseModel):
    version: str
    path: str
    community: bool = True
    enterprise: bool = False


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _parse_git_line(line: str) -> dict:
    line = line.strip()
    m = re.search(r"(Receiving objects|Resolving deltas|Checking out files):\s+(\d+)%\s+\((\d+)/(\d+)\)", line)
    if m:
        label, pct, done, total = m.group(1), int(m.group(2)), m.group(3), m.group(4)
        speed_m = re.search(r"([\d.]+)\s*MiB/s", line)
        speed = f" — {speed_m.group(1)} MiB/s" if speed_m else ""
        return {"type": "progress", "pct": pct, "label": f"{label} : {pct}%  ({done}/{total}){speed}"}
    if line:
        return {"type": "log", "msg": line}
    return {}


def _repo_status(path: Path) -> dict:
    """Return local git status without network access."""
    if not path.exists() or not (path / ".git").exists():
        return {"installed": False, "path": str(path)}
    try:
        import git as gitlib
        repo = gitlib.Repo(path)
        head = repo.head.commit
        # Count commits behind remote tracking ref (cached, no network)
        behind = 0
        tracking = None
        try:
            branch = repo.active_branch.name
            tracking = f"origin/{branch}"
            behind = sum(1 for _ in repo.iter_commits(f"HEAD..{tracking}"))
        except Exception:
            pass
        recent = []
        for c in repo.iter_commits(max_count=10):
            recent.append({
                "sha": c.hexsha[:8],
                "message": c.message.strip().split("\n")[0][:80],
                "author": c.author.name,
                "date": c.committed_datetime.isoformat(),
            })
        return {
            "installed": True,
            "path": str(path),
            "head": head.hexsha[:8],
            "message": head.message.strip().split("\n")[0][:80],
            "date": head.committed_datetime.isoformat(),
            "behind": behind,
            "branch": tracking,
            "recent_commits": recent,
        }
    except Exception as exc:
        return {"installed": True, "path": str(path), "error": str(exc)}


@router.get("/check-all")
async def check_all():
    """Check installation status for all versions at default paths (no network).
    Includes SUPPORTED_VERSIONS plus any additional version directories found on disk."""
    _migrate_sources_dir()
    loop = asyncio.get_event_loop()
    base = SOURCES_BASE
    # Collect all versions to check: base list + any extra dirs found on disk
    versions_to_check = list(SUPPORTED_VERSIONS)
    if base.exists():
        for entry in base.iterdir():
            if entry.is_dir() and VERSION_RE.match(entry.name) and entry.name not in versions_to_check:
                versions_to_check.append(entry.name)
    results: dict[str, dict] = {}
    for version in versions_to_check:
        comm = await loop.run_in_executor(None, _repo_status, base / version)
        ent  = await loop.run_in_executor(None, _repo_status, base / f"{version}-enterprise")
        results[version]              = comm
        results[f"{version}-enterprise"] = ent
    return results


@router.get("/check-updates/{version}")
async def check_updates(version: str, path: str = ""):
    """Fetch remote then return behind count (requires network)."""
    loop = asyncio.get_event_loop()
    _migrate_sources_dir()
    resolved = Path(path).expanduser() if path else SOURCES_BASE / version
    if not (resolved / ".git").exists():
        return {"error": "Dépôt non trouvé", "behind": None}

    async def _fetch():
        proc = await asyncio.create_subprocess_exec(
            "git", "-C", str(resolved), "fetch", "--quiet", "origin", version,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    await _fetch()
    return await loop.run_in_executor(None, _repo_status, resolved)


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
        return {"created": False, "key_path": str(key_path),
                "public_key": pub_path.read_text().strip() if pub_path.exists() else ""}
    try:
        subprocess.run(["ssh-keygen", "-t", "ed25519", "-C", comment,
                        "-f", str(key_path), "-N", ""],
                       check=True, capture_output=True)
        return {"created": True, "key_path": str(key_path), "public_key": pub_path.read_text().strip()}
    except subprocess.CalledProcessError as exc:
        raise HTTPException(500, f"ssh-keygen failed: {exc.stderr.decode()}")


async def _stream_git(cmd: list[str], label: str):
    yield {"type": "start", "msg": f"⟳ {label}"}
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        env={**__import__("os").environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    async for raw in proc.stdout:
        evt = _parse_git_line(raw.decode("utf-8", errors="replace").rstrip("\r\n"))
        if evt:
            yield evt
    await proc.wait()
    yield {"type": "done" if proc.returncode == 0 else "error",
           "msg": "✓ Terminé" if proc.returncode == 0 else f"git a retourné {proc.returncode}"}


@router.post("/sync-stream")
async def sync_source_stream(req: SyncRequest):
    if not VERSION_RE.match(req.version):
        raise HTTPException(400, f"Version invalide : {req.version} (format attendu : X.Y)")
    base = Path(req.path).expanduser().resolve()

    branch = _branch_for_version(req.version)

    async def generate():
        jobs: list[tuple[str, list[str]]] = []
        if req.community:
            if (base / ".git").exists():
                jobs.append((f"Mise à jour Community {req.version}",
                             ["git", "-C", str(base), "pull", "--progress", "origin", branch]))
            else:
                base.mkdir(parents=True, exist_ok=True)
                jobs.append((f"Téléchargement Community {req.version}",
                             ["git", "clone", "--progress", "--depth=1",
                              "--branch", branch, COMMUNITY_REMOTE, str(base)]))
        if req.enterprise:
            if not test_github_ssh():
                yield _sse({"type": "error", "msg": "Pas d'accès SSH GitHub."})
            else:
                ent = base.parent / (base.name + "-enterprise")
                if (ent / ".git").exists():
                    jobs.append((f"Mise à jour Enterprise {req.version}",
                                 ["git", "-C", str(ent), "pull", "--progress", "origin", branch]))
                else:
                    ent.mkdir(parents=True, exist_ok=True)
                    jobs.append((f"Téléchargement Enterprise {req.version}",
                                 ["git", "clone", "--progress", "--depth=1",
                                  "--branch", branch, ENTERPRISE_REMOTE, str(ent)]))
        for label, cmd in jobs:
            async for evt in _stream_git(cmd, label):
                yield _sse(evt)
        yield _sse({"type": "end"})

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/sync")
async def sync_source(req: SyncRequest):
    from ...services.source_manager import clone_or_pull
    if not VERSION_RE.match(req.version):
        raise HTTPException(400, f"Version invalide : {req.version}")
    results = []
    base = Path(req.path).expanduser()
    branch = _branch_for_version(req.version)
    if req.community:
        results.append({"type": "community", **clone_or_pull(COMMUNITY_REMOTE, base, branch)})
    if req.enterprise:
        if not test_github_ssh():
            raise HTTPException(403, "Pas d'accès SSH GitHub")
        ent = base.parent / (base.name + "-enterprise")
        results.append({"type": "enterprise", **clone_or_pull(ENTERPRISE_REMOTE, ent, branch)})
    return {"results": results}


@router.get("/check/{version}")
async def check_version(version: str):
    """Check installation status for a single version."""
    if not VERSION_RE.match(version):
        raise HTTPException(400, f"Version invalide : {version}")
    loop = asyncio.get_event_loop()
    base = SOURCES_BASE / version
    comm = await loop.run_in_executor(None, _repo_status, base)
    ent  = await loop.run_in_executor(None, _repo_status, base.parent / f"{version}-enterprise")
    return {version: comm, f"{version}-enterprise": ent}


@router.get("/status")
async def git_status(path: str):
    from ...services.source_manager import get_git_status
    return get_git_status(path)


@router.get("/commits")
async def commits(path: str, count: int = 10):
    from ...services.source_manager import get_recent_commits
    return {"commits": get_recent_commits(path, count)}


@router.get("/commits-since")
async def commits_since(path: str, days: int = 30):
    """Commits of the last N days with their changed files — deepens the
    shallow clone on demand. Used by the 'Résumé 30 j' button."""
    from ...services.source_manager import get_commits_since
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: get_commits_since(path, days))


# ── Maintenance: open VS Code workspace ─────────────────────────────

def _vscode_cmd(workspace_path: Path) -> list[str]:
    if code := shutil.which("code"):
        return [code, str(workspace_path)]
    if codium := shutil.which("codium"):
        return [codium, str(workspace_path)]
    if sys.platform == "darwin":
        return ["open", "-a", "Visual Studio Code", str(workspace_path)]
    raise HTTPException(400, "VS Code introuvable. Installez la commande 'code'.")


@router.post("/{version}/vscode")
async def open_source_workspace(version: str):
    if not VERSION_RE.match(version):
        raise HTTPException(400, "Version invalide")
    community = SOURCES_BASE / version
    enterprise = SOURCES_BASE / f"{version}-enterprise"
    folders: list[dict[str, str]] = []
    if community.is_dir():
        folders.append({"name": f"Odoo {version} Community", "path": str(community)})
    if enterprise.is_dir():
        folders.append({"name": f"Odoo {version} Enterprise", "path": str(enterprise)})
    if not folders:
        raise HTTPException(400, f"Aucune source installée pour Odoo {version}.")

    workspace_dir = Path.home() / ".odoo-consultant" / "workspaces"
    workspace_dir.mkdir(parents=True, exist_ok=True)
    workspace_path = workspace_dir / f"odoo-{version}.code-workspace"
    workspace = {
        "folders": folders,
        "settings": {
            "files.exclude": {"**/.git": True, "**/__pycache__": True, "**/node_modules": True},
            "search.exclude": {"**/.git": True, "**/__pycache__": True, "**/node_modules": True},
        },
    }
    workspace_path.write_text(json.dumps(workspace, indent=2, ensure_ascii=False), encoding="utf-8")
    subprocess.Popen(_vscode_cmd(workspace_path), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"ok": True, "workspace": str(workspace_path), "folders": folders}


# ── Maintenance: open the sources folder in file manager ───────────

@router.post("/{version}/open-folder")
async def open_source_folder(version: str):
    if not VERSION_RE.match(version):
        raise HTTPException(400, "Version invalide")
    community = SOURCES_BASE / version
    target = community if community.is_dir() else SOURCES_BASE
    if not target.exists():
        raise HTTPException(404, "Dossier introuvable")
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", str(target)])
        elif sys.platform.startswith("win"):
            os.startfile(str(target))  # type: ignore[attr-defined]
        else:
            subprocess.Popen(["xdg-open", str(target)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as exc:
        raise HTTPException(500, f"Impossible d'ouvrir : {exc}")
    return {"ok": True, "path": str(target)}


