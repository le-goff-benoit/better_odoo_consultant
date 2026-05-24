"""Source-code search helpers shared by 6 skill handlers.

Used by ``search_odoo_source``, ``read_odoo_file``, ``search_project_source``,
``read_project_file``, ``search_target_source``, ``read_target_file``.
"""
from __future__ import annotations

import asyncio
import os
from typing import Optional


def source_roots(source_path: str) -> list[tuple[str, str]]:
    """Return labeled Community/Enterprise roots for an Odoo source version."""
    base = os.path.realpath(source_path)
    parent = os.path.dirname(base)
    name = os.path.basename(base.rstrip(os.sep))
    if name.endswith("-enterprise"):
        community_name = name.removesuffix("-enterprise")
        roots = [("enterprise", base)]
        community = os.path.join(parent, community_name)
        if os.path.isdir(community):
            roots.append(("community", os.path.realpath(community)))
        return roots

    roots = [("community", base)]
    enterprise = os.path.join(parent, f"{name}-enterprise")
    if os.path.isdir(enterprise):
        roots.append(("enterprise", os.path.realpath(enterprise)))
    return roots


def safe_join(root: str, sub_path: str) -> Optional[str]:
    root_real = os.path.realpath(root)
    full = os.path.realpath(os.path.join(root_real, sub_path)) if sub_path else root_real
    try:
        return full if os.path.commonpath([root_real, full]) == root_real else None
    except ValueError:
        return None


def split_source_prefix(sub_path: str) -> tuple[Optional[str], str]:
    clean = (sub_path or "").strip().strip("/")
    if not clean:
        return None, ""
    first, _, rest = clean.partition("/")
    if first in {"community", "enterprise"}:
        return first, rest
    return None, clean


def safe_source_path(source_path: str, sub_path: str, include_enterprise: bool = True) -> Optional[str]:
    """Return an absolute path only if it stays within a known source root."""
    if not include_enterprise:
        return safe_join(source_path, sub_path)
    prefix, clean_path = split_source_prefix(sub_path)
    for label, root in source_roots(source_path):
        if prefix and label != prefix:
            continue
        full = safe_join(root, clean_path)
        if full and os.path.exists(full):
            return full
        if full and label == "enterprise" and clean_path.startswith("addons/"):
            alt = safe_join(root, clean_path[len("addons/"):])
            if alt and os.path.exists(alt):
                return alt
        if full and label == "community" and clean_path.startswith("addons/"):
            # `base` (and a few core modules) live under odoo/addons/, not the
            # top-level addons/ — e.g. "addons/base" → "odoo/addons/base".
            alt = safe_join(root, "odoo/" + clean_path)
            if alt and os.path.exists(alt):
                return alt
    return None


def source_search_dirs(source_path: str, sub_path: str, include_enterprise: bool = True) -> list[str]:
    if not include_enterprise:
        full = safe_join(source_path, sub_path)
        return [full] if full and os.path.isdir(full) else []

    prefix, clean_path = split_source_prefix(sub_path)
    dirs: list[str] = []
    for label, root in source_roots(source_path):
        if prefix and label != prefix:
            continue
        full = safe_join(root, clean_path)
        if full and os.path.isdir(full):
            dirs.append(full)
        elif label == "enterprise" and clean_path.startswith("addons/"):
            alt = safe_join(root, clean_path[len("addons/"):])
            if alt and os.path.isdir(alt):
                dirs.append(alt)
        elif label == "community" and clean_path.startswith("addons/"):
            alt = safe_join(root, "odoo/" + clean_path)
            if alt and os.path.isdir(alt):
                dirs.append(alt)
    return dirs


def source_display_path(source_path: str, file_abs: str, include_enterprise: bool = True) -> str:
    file_real = os.path.realpath(file_abs)
    if not include_enterprise:
        base = os.path.realpath(source_path)
        try:
            if os.path.commonpath([base, file_real]) == base:
                return os.path.relpath(file_real, base)
        except ValueError:
            pass
        return file_abs

    roots = sorted(source_roots(source_path), key=lambda item: len(item[1]), reverse=True)
    for label, root in roots:
        root_real = os.path.realpath(root)
        try:
            if os.path.commonpath([root_real, file_real]) == root_real:
                return f"{label}/{os.path.relpath(file_real, root_real)}"
        except ValueError:
            continue
    return file_abs


async def search(args: dict, source_path: str, include_enterprise: bool = True) -> dict:
    pattern    = args.get("pattern", "")
    sub_path   = args.get("path", "") or ""
    file_types = args.get("file_types") or ["*.py"]
    case_sensitive = args.get("case_sensitive", True)
    try:
        max_matches = max(50, min(int(args.get("max_matches") or 500), 5000))
    except (TypeError, ValueError):
        max_matches = 500

    if not pattern or not pattern.strip():
        return {"ok": False, "error": "pattern manquant"}

    search_dirs = source_search_dirs(source_path, sub_path, include_enterprise=include_enterprise)
    if not search_dirs:
        return {"ok": False, "error": "Chemin invalide (traversal détecté)"}

    includes = []
    for ft in file_types[:4]:
        includes += ["--include", ft]

    grep_args = ["grep", "-r", "-n"]
    if not case_sensitive:
        grep_args.append("-i")
    grep_args += ["-m", str(max_matches), *includes, pattern, *search_dirs]

    try:
        proc = await asyncio.create_subprocess_exec(
            *grep_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
    except asyncio.TimeoutError:
        return {"ok": False, "error": "Timeout — pattern trop large, affinez la recherche"}

    raw_lines = stdout.decode("utf-8", errors="replace").splitlines()
    total_lines = len(raw_lines)

    by_file: dict = {}
    for line in raw_lines[:max_matches]:
        parts = line.split(":", 2)
        if len(parts) < 3:
            continue
        file_abs, linenum, content = parts[0], parts[1], parts[2]
        rel = source_display_path(source_path, file_abs, include_enterprise=include_enterprise)
        if rel not in by_file:
            by_file[rel] = []
        by_file[rel].append({"line": int(linenum), "content": content.strip()})

    if not by_file:
        suggestions: list[str] = []
        if case_sensitive:
            suggestions.append("Retentez avec `case_sensitive=false` (recherche insensible à la casse).")
        if "'" not in pattern and '"' not in pattern and " = " in pattern:
            suggestions.append("Essayez avec des guillemets différents (simples vs doubles).")
        if "é" in pattern or "è" in pattern or "à" in pattern:
            suggestions.append("Essayez sans les accents.")
        if not sub_path:
            suggestions.append("Restreignez la recherche avec `path=\"addons/<module>\"` si vous savez où chercher.")
        return {
            "ok": True,
            "matches": 0,
            "files": {},
            "files_count": 0,
            "note": "Aucune correspondance.",
            "suggestions": suggestions or None,
        }

    truncated = total_lines > max_matches
    return {
        "ok": True,
        "matches": total_lines,
        "returned_matches": sum(len(matches) for matches in by_file.values()),
        "max_matches": max_matches,
        "files_count": len(by_file),
        "files": by_file,
        "truncated": truncated,
        "warning": (
            f"Résultats source bornés à {max_matches} lignes sur {total_lines} vues. "
            "Affinez le pattern/path ou augmente max_matches pour poursuivre."
            if truncated else None
        ),
        "note": "Recherche exhaustive sur la sortie collectée." if not truncated else None,
    }


async def read_file(args: dict, source_path: str, include_enterprise: bool = True) -> dict:
    rel_path   = args.get("path", "")
    start_line = max(1, int(args.get("start_line") or 1))
    end_line   = int(args.get("end_line") or 0)
    try:
        max_lines = max(50, min(int(args.get("max_lines") or 1000), 5000))
    except (TypeError, ValueError):
        max_lines = 1000

    file_abs = safe_source_path(source_path, rel_path, include_enterprise=include_enterprise)
    if not file_abs:
        return {"ok": False, "error": "Chemin invalide"}
    if not os.path.isfile(file_abs):
        return {"ok": False, "error": f"Fichier introuvable : {rel_path}"}

    try:
        with open(file_abs, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

    total = len(all_lines)
    s = start_line - 1
    requested_end = end_line if end_line > 0 else s + max_lines
    e = min(requested_end, s + max_lines, total)
    truncated = requested_end > e or (end_line <= 0 and e < total)

    content = "".join(all_lines[s:e])
    return {
        "ok":         True,
        "path":       rel_path,
        "start_line": s + 1,
        "end_line":   e,
        "total_lines": total,
        "returned_lines": max(e - s, 0),
        "max_lines": max_lines,
        "truncated": truncated,
        "warning": (
            f"Lecture partielle : lignes {s + 1}-{e} sur {total}. "
            "Relance avec start_line/end_line ou augmente max_lines pour lire la suite."
            if truncated else None
        ),
        "content":    content,
    }
