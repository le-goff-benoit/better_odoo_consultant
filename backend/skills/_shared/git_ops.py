"""Git operations helper — backs the ``git_show_commit`` skill."""
from __future__ import annotations

import asyncio
import os
import re
from typing import Optional

_SHA_RE = re.compile(r"^[0-9a-fA-F]{7,40}$")
_NUMSTAT_RE = re.compile(r"^(\d+|-)\t(\d+|-)\t(.+)$")


async def show_commit(args: dict, source_path: Optional[str], repo_path: Optional[str], target_path: Optional[str]) -> dict:
    """Show one commit (metadata + numstat + unified diff) from a local git repo.

    Tolerates shallow clones by deepening on demand (up to 3 × --deepen 500) when
    the SHA is unknown. Returns structured stats plus the textual diff capped to
    ``max_lines`` with explicit metadata when bounded.
    """
    sha = (args.get("sha") or "").strip()
    scope = (args.get("scope") or "").strip().lower()
    max_lines_raw = args.get("max_lines")
    try:
        max_lines = int(max_lines_raw) if max_lines_raw is not None else 2000
    except (TypeError, ValueError):
        max_lines = 2000
    max_lines = max(50, min(max_lines, 10000))

    if not sha or not _SHA_RE.match(sha):
        return {"ok": False, "error": "SHA invalide (7 à 40 caractères hexadécimaux attendus)."}

    if scope == "odoo":
        repo = source_path
    elif scope == "enterprise":
        repo = (source_path + "-enterprise") if source_path else None
    elif scope == "target":
        repo = target_path
    elif scope == "project":
        repo = repo_path
    else:
        return {"ok": False, "error": "scope doit être 'odoo', 'enterprise', 'target' ou 'project'."}

    if not repo or not os.path.isdir(os.path.join(repo, ".git")):
        labels = {"odoo": "Sources Odoo Community", "enterprise": "Sources Odoo Enterprise",
                  "target": "Sources de la version cible", "project": "Repo projet client"}
        return {"ok": False, "error": f"{labels.get(scope, scope)} non disponible — clonez-les depuis l'app."}

    async def _git(*git_args: str, timeout: int = 30) -> tuple[int, str, str]:
        proc = await asyncio.create_subprocess_exec(
            "git", "-C", repo, *git_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return 124, "", "timeout"
        return proc.returncode or 0, stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace")

    deepened = 0
    rc, out, _ = await _git("cat-file", "-e", sha, timeout=10)
    if rc != 0:
        branch_rc, branch_out, _ = await _git("rev-parse", "--abbrev-ref", "HEAD", timeout=10)
        branch = branch_out.strip() if branch_rc == 0 else ""
        for _ in range(3):
            if not branch or branch == "HEAD":
                break
            frc, _, _ = await _git("fetch", "--quiet", "--deepen=500", "origin", branch, timeout=90)
            deepened += 1
            if frc != 0:
                break
            rc, _, _ = await _git("cat-file", "-e", sha, timeout=10)
            if rc == 0:
                break
        if rc != 0:
            return {
                "ok": False,
                "error": f"Commit {sha} introuvable dans le clone local (même après {deepened} deepen).",
                "suggestion": (
                    "Vérifie le SHA, ou mets à jour la source depuis l'app (bouton « Vérifier »). "
                    "Si le commit est très ancien, il peut ne plus être atteignable depuis la branche actuelle."
                ),
            }

    rc, header_out, header_err = await _git(
        "show", "--no-patch",
        "--pretty=format:%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b",
        sha, timeout=20,
    )
    if rc != 0:
        return {"ok": False, "error": f"git show (header) a échoué : {header_err.strip()[:200]}"}

    parts = header_out.split("\x1f")
    if len(parts) < 5:
        return {"ok": False, "error": "Sortie git show inattendue."}
    full_sha, author, email, iso_date, subject = parts[0], parts[1], parts[2], parts[3], parts[4]
    body = parts[5].strip() if len(parts) > 5 else ""

    rc, num_out, _ = await _git("show", "--numstat", "--format=", sha, timeout=30)
    files: list[dict] = []
    total_add = total_del = 0
    if rc == 0:
        for line in num_out.splitlines():
            m = _NUMSTAT_RE.match(line.strip())
            if not m:
                continue
            add_s, del_s, fpath = m.group(1), m.group(2), m.group(3)
            adds = 0 if add_s == "-" else int(add_s)
            dels = 0 if del_s == "-" else int(del_s)
            files.append({"path": fpath, "additions": adds, "deletions": dels})
            total_add += adds
            total_del += dels

    rc, diff_out, diff_err = await _git("show", "--patch", "--format=", sha, timeout=45)
    if rc != 0:
        return {"ok": False, "error": f"git show (diff) a échoué : {diff_err.strip()[:200]}"}

    diff_lines = diff_out.splitlines()
    truncated = len(diff_lines) > max_lines
    diff_text = "\n".join(diff_lines[:max_lines])

    return {
        "ok": True,
        "scope": scope,
        "sha": full_sha,
        "short_sha": full_sha[:8],
        "author": author,
        "email": email,
        "date": iso_date,
        "subject": subject,
        "message": body,
        "stats": {
            "files": len(files),
            "insertions": total_add,
            "deletions": total_del,
        },
        "files": files,
        "diff": diff_text,
        "diff_lines": len(diff_lines),
        "returned_diff_lines": min(len(diff_lines), max_lines),
        "max_lines": max_lines,
        "truncated": truncated,
        "warning": (f"Diff borné à {max_lines} lignes sur {len(diff_lines)}. "
                    "Augmente max_lines (max 10000) ou inspecte les fichiers listés."
                    if truncated else None),
        "deepened": deepened or None,
        "note": (f"Diff tronqué à {max_lines} lignes — augmentez max_lines (max 10000) ou demandez un fichier précis."
                 if truncated else None),
    }
