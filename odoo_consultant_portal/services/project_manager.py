import subprocess
from pathlib import Path
from typing import Optional
import git


def clone_project(remote_url: str, local_path: str) -> dict:
    path = Path(local_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    repo = git.Repo.clone_from(remote_url, path)
    return {"action": "cloned", "path": str(path), "head": repo.head.commit.hexsha[:8]}


def pull_project(local_path: str, branch: Optional[str] = None) -> dict:
    repo = git.Repo(local_path)
    origin = repo.remotes.origin
    if branch:
        origin.pull(branch)
    else:
        origin.pull()
    return {"action": "pulled", "path": local_path, "head": repo.head.commit.hexsha[:8]}


def list_branches(local_path: str) -> list[str]:
    repo = git.Repo(local_path)
    return [b.name for b in repo.branches]


def recent_commits(local_path: str, count: int = 10) -> list[dict]:
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


def open_path(local_path: str) -> None:
    subprocess.Popen(["xdg-open", local_path])
