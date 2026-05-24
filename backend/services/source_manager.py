import re
import subprocess
from pathlib import Path
from typing import Optional
import git

SUPPORTED_VERSIONS = ["15.0", "16.0", "17.0", "18.0", "19.0"]
VERSION_RE = re.compile(r'^\d+\.\d+$')
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


def get_commits_since(local_path: str, days: int = 30, max_commits: int = 120) -> dict:
    """Return commits from the last *days* days, with the files each one changed.

    Source repos are shallow clones (``--depth=1``) so they hold no history by
    default. History is deepened on demand with ``git fetch --shallow-since``
    before reading the log — best-effort: if the deepen fails the log still
    returns whatever history is locally available.
    """
    path = Path(local_path)
    if not (path / ".git").exists():
        return {"available": False, "commits": []}
    since = f"{days} days ago"

    def _git(*args, timeout: int = 120):
        return subprocess.run(
            ["git", "-C", str(path), *args],
            capture_output=True, text=True, timeout=timeout,
        )

    deepened = False
    try:
        branch = (_git("rev-parse", "--abbrev-ref", "HEAD", timeout=15).stdout or "").strip()
        if branch and branch != "HEAD":
            fetched = _git("fetch", "--quiet", f"--shallow-since={since}", "origin", branch, timeout=240)
            deepened = fetched.returncode == 0
    except Exception:
        pass

    try:
        # \x1e starts each commit record, \x1f separates header fields; the
        # changed-file paths follow on their own lines (--name-only).
        out = _git(
            "log", f"--since={since}", "--no-merges", "--date=short",
            "--pretty=format:%x1e%H%x1f%an%x1f%ad%x1f%s",
            "--name-only", timeout=90,
        ).stdout or ""
    except Exception as exc:
        return {"available": False, "error": str(exc), "commits": []}

    commits: list[dict] = []
    for chunk in out.split("\x1e"):
        chunk = chunk.strip("\n")
        if not chunk:
            continue
        header, _, files_blob = chunk.partition("\n")
        parts = header.split("\x1f")
        if len(parts) < 4:
            continue
        files = [f for f in files_blob.split("\n") if f.strip()]
        commits.append({
            "sha": parts[0][:8],
            "author": parts[1],
            "date": parts[2],
            "subject": parts[3],
            "files": files[:15],
            "file_count": len(files),
        })
        if len(commits) >= max_commits:
            break
    return {"available": True, "deepened": deepened, "days": days, "commits": commits}
