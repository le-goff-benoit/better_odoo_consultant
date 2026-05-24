import os
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException

from ...core.config import settings

router = APIRouter()

ROOT = Path(__file__).resolve().parents[3]
REMOTE_REF = "origin/main"


def _git(args: list[str], timeout: int = 30) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Git command failed").strip()
        raise RuntimeError(detail)
    return result.stdout.strip()


def _short(sha: str) -> str:
    return sha[:7] if sha else ""


def _stop_current_process() -> None:
    time.sleep(0.5)
    os._exit(0)


@router.get("/status")
async def update_status():
    try:
        _git(["rev-parse", "--is-inside-work-tree"])
        local_sha = _git(["rev-parse", "HEAD"])
        _git(["fetch", "origin", "main"], timeout=45)
        remote_sha = _git(["rev-parse", REMOTE_REF])
        behind = int(_git(["rev-list", "--count", f"HEAD..{REMOTE_REF}"]) or "0")
        ahead = int(_git(["rev-list", "--count", f"{REMOTE_REF}..HEAD"]) or "0")
        latest_subject = _git(["log", "-1", "--pretty=%s", REMOTE_REF])
        return {
            "ok": True,
            "update_available": local_sha != remote_sha and behind > 0,
            "local_sha": local_sha,
            "local_short": _short(local_sha),
            "remote_sha": remote_sha,
            "remote_short": _short(remote_sha),
            "behind": behind,
            "ahead": ahead,
            "latest_subject": latest_subject,
        }
    except Exception as exc:
        return {"ok": False, "update_available": False, "error": str(exc)}


@router.post("/apply")
async def apply_update(background_tasks: BackgroundTasks):
    try:
        _git(["rev-parse", "--is-inside-work-tree"])
    except Exception as exc:
        raise HTTPException(400, f"Mise à jour impossible : {exc}")

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    log_path = settings.data_dir / "portal-update.log"
    script_path = settings.data_dir / f"portal-update-{os.getpid()}.sh"
    script = f"""#!/usr/bin/env bash
set -euo pipefail
cd {str(ROOT)!r}
LOG={str(log_path)!r}
{{
  echo ""
  echo "===== $(date -Is) — update requested from web UI ====="
  sleep 2
  git fetch origin main
  git reset --hard origin/main
    bash scripts/install.sh
  echo "===== $(date -Is) — starting portal ====="
    exec bash scripts/start.sh
}} >> "$LOG" 2>&1
"""
    script_path.write_text(script)
    script_path.chmod(0o700)
    subprocess.Popen(
        ["bash", str(script_path)],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    background_tasks.add_task(_stop_current_process)
    return {
        "ok": True,
        "message": "Mise à jour lancée. Le portail va se fermer puis redémarrer.",
        "log_path": str(log_path),
    }