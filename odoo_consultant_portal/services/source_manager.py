import subprocess
from pathlib import Path
from typing import Optional
import git

SUPPORTED_VERSIONS = ["15.0", "16.0", "17.0", "18.0", "19.0"]
COMMUNITY_REMOTE = "https://github.com/odoo/odoo.git"
ENTERPRISE_REMOTE = "git@github.com:odoo/enterprise.git"


def detect_ssh_keys() -> list[str]:
    ssh_dir = Path.home() / ".ssh"
    if not ssh_dir.exists():
        return []
    keys = []
    for f in ssh_dir.iterdir():
        if f.suffix == "" and not f.name.endswith(".pub") and f.name not in ("known_hosts", "config", "authorized_keys"):
            keys.append(str(f))
    return keys


def test_github_ssh() -> bool:
    try:
        result = subprocess.run(
            ["ssh", "-T", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5", "git@github.com"],
            capture_output=True, text=True, timeout=10,
        )
        # GitHub répond sur stderr avec exit code 1 (pas de shell) — c'est normal
        combined = (result.stdout + result.stderr).lower()
        return "successfully authenticated" in combined or "hi " in combined
    except Exception:
        return False


def clone_or_pull(remote_url: str, local_path: Path, branch: str) -> dict:
    local_path = Path(local_path)
    if local_path.exists() and (local_path / ".git").exists():
        repo = git.Repo(local_path)
        origin = repo.remotes.origin
        origin.pull(branch)
        action = "pulled"
    else:
        local_path.mkdir(parents=True, exist_ok=True)
        repo = git.Repo.clone_from(remote_url, local_path, branch=branch, depth=1)
        action = "cloned"
    return {
        "action": action,
        "path": str(local_path),
        "branch": branch,
        "head": repo.head.commit.hexsha[:8],
    }


def get_git_status(local_path: str) -> dict:
    try:
        repo = git.Repo(local_path)
        return {
            "branch": repo.active_branch.name,
            "dirty": repo.is_dirty(),
            "untracked": len(repo.untracked_files),
            "head": repo.head.commit.hexsha[:8],
            "message": repo.head.commit.message.strip()[:120],
        }
    except Exception as exc:
        return {"error": str(exc)}


def get_recent_commits(local_path: str, count: int = 10) -> list[dict]:
    try:
        repo = git.Repo(local_path)
        return [
            {
                "sha": c.hexsha[:8],
                "message": c.message.strip()[:120],
                "author": c.author.name,
                "date": c.committed_datetime.isoformat(),
            }
            for c in repo.iter_commits(max_count=count)
        ]
    except Exception:
        return []
