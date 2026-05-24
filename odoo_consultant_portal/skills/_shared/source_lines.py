"""LOC-counting helper used by the ``count_source_lines`` skill."""
from __future__ import annotations

import asyncio
import os

from .source_search import safe_source_path

_COUNT_MAX_FILES = 50_000
_COUNT_TIMEOUT_SECS = 45
_EXCLUDE_DIRS = ("/.git/", "/node_modules/", "/__pycache__/", "/.venv/", "/venv/", "/.tox/", "/dist/", "/build/")


def _group_key(rel: str, group_by: str) -> str:
    if group_by == "module":
        parts = rel.split(os.sep)
        if "addons" in parts:
            idx = parts.index("addons")
            return parts[idx + 1] if idx + 1 < len(parts) else "(root)"
        return parts[0] if parts and parts[0] else "(root)"
    if group_by == "directory":
        return os.path.dirname(rel) or "(root)"
    if group_by == "extension":
        return os.path.splitext(rel)[1].lower() or "(no ext)"
    return "all"


async def count(args: dict, base_dir: str) -> dict:
    """Exhaustively count files and lines under base_dir/<sub_path>, grouped."""
    sub_path   = args.get("path", "") or ""
    file_types = args.get("file_types") or ["*.py"]
    group_by   = args.get("group_by") or "extension"
    if group_by not in ("extension", "module", "directory", "none"):
        group_by = "extension"

    target_dir = safe_source_path(base_dir, sub_path)
    if not target_dir:
        return {"ok": False, "error": "Chemin invalide (traversal détecté)"}
    if not os.path.isdir(target_dir):
        return {"ok": False, "error": f"Dossier introuvable : {sub_path or base_dir}"}

    find_cmd = ["find", target_dir, "-type", "f"]
    types = file_types[:10]
    if types:
        find_cmd.append("(")
        for i, ft in enumerate(types):
            if i > 0:
                find_cmd.append("-o")
            find_cmd += ["-name", ft]
        find_cmd.append(")")
    find_cmd += ["-print0"]

    try:
        proc = await asyncio.create_subprocess_exec(
            *find_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        files_blob, _ = await asyncio.wait_for(proc.communicate(), timeout=_COUNT_TIMEOUT_SECS)
    except asyncio.TimeoutError:
        return {"ok": False, "error": f"Timeout (>{_COUNT_TIMEOUT_SECS}s) — restreignez via path ou file_types"}

    raw_files = [f.decode("utf-8", errors="replace") for f in files_blob.split(b"\x00") if f]
    files = [f for f in raw_files if not any(ex in f for ex in _EXCLUDE_DIRS)]

    if not files:
        return {
            "ok": True, "scope_path": base_dir, "sub_path": sub_path or ".",
            "file_types": types, "group_by": group_by,
            "total_files": 0, "total_lines": 0, "by_group": {},
            "note": "Aucun fichier trouvé",
        }
    if len(files) > _COUNT_MAX_FILES:
        return {"ok": False, "error": f"Trop de fichiers ({len(files)} > {_COUNT_MAX_FILES}). Restreins via path ou file_types."}

    base_real = os.path.realpath(base_dir) + os.sep

    def _do_count() -> tuple[int, dict]:
        total = 0
        groups: dict = {}
        for fp in files:
            try:
                with open(fp, "rb") as fh:
                    buf = fh.read()
                n = buf.count(b"\n")
                if buf and not buf.endswith(b"\n"):
                    n += 1
            except OSError:
                n = 0
            total += n
            rel = fp.replace(base_real, "")
            key = _group_key(rel, group_by)
            g = groups.get(key)
            if g is None:
                groups[key] = {"files": 1, "lines": n}
            else:
                g["files"] += 1
                g["lines"] += n
        return total, groups

    loop = asyncio.get_event_loop()
    total_lines, by_group = await loop.run_in_executor(None, _do_count)

    sorted_groups = sorted(by_group.items(), key=lambda kv: -kv[1]["lines"])
    truncated = len(sorted_groups) > 50
    capped = dict(sorted_groups[:50])

    return {
        "ok":              True,
        "scope_path":      base_dir,
        "sub_path":        sub_path or ".",
        "file_types":      types,
        "group_by":        group_by,
        "total_files":     len(files),
        "total_lines":     total_lines,
        "by_group":        capped,
        "groups_truncated": truncated,
    }
