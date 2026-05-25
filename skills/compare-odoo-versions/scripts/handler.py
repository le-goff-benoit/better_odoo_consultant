"""compare_odoo_versions handler — semantic source diff between two Odoo versions."""

from __future__ import annotations

import difflib
from pathlib import Path
from typing import Any


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.skills._shared.odoo_analysis import (
        build_manifest_index,
        extract_model_classes,
        find_xml_record,
    )

    target = str(args.get("target") or "").strip()
    from_root = _resolve_version(args.get("from_version"), args.get("scope") or "odoo")
    to_root = _resolve_version(args.get("to_version"), args.get("scope") or "odoo")
    if not target:
        return {"ok": False, "error": "target manquant"}
    if from_root is None or to_root is None:
        return {"ok": False, "error": "Sources de version introuvables", "from_root": from_root, "to_root": to_root}

    kind, _, value = target.partition(":")
    if not value:
        kind, value = "model", target

    if kind == "model":
        before = _filter_model(extract_model_classes(from_root, limit=2000), value)
        after = _filter_model(extract_model_classes(to_root, limit=2000), value)
        return {
            "ok": True,
            "target": target,
            "from_version": args.get("from_version"),
            "to_version": args.get("to_version"),
            "kind": kind,
            "summary": _model_summary(before, after),
            "before": before,
            "after": after,
            "diff": _model_diff(before, after),
        }

    if kind == "module":
        before_index = build_manifest_index(from_root)
        after_index = build_manifest_index(to_root)
        before = before_index.get(value)
        after = after_index.get(value)
        return {
            "ok": True,
            "target": target,
            "kind": kind,
            "summary": _module_summary(value, before, after),
            "before": _module_payload(before),
            "after": _module_payload(after),
            "diff": _manifest_diff(before, after),
            "files": _file_delta(before, after),
        }

    if kind == "view":
        before = find_xml_record(from_root, value)
        after = find_xml_record(to_root, value)
        return {
            "ok": True,
            "target": target,
            "kind": kind,
            "summary": _view_summary(value, before, after),
            "before": before,
            "after": after,
            "diff": list(difflib.unified_diff(
                (before or {}).get("xml", "").splitlines(),
                (after or {}).get("xml", "").splitlines(),
                fromfile=f"{args.get('from_version')}:{value}",
                tofile=f"{args.get('to_version')}:{value}",
                lineterm="",
            ))[:500],
        }

    return {"ok": False, "error": f"Type de cible non supporté : {kind}"}


def _resolve_version(version: Any, scope: str) -> str | None:
    if not version:
        return None
    base = Path.home() / ".odoo-consultant" / "sources"
    version_name = str(version).strip()
    folder = base / (f"{version_name}-enterprise" if scope == "enterprise" else version_name)
    if folder.is_dir():
        return str(folder)
    if scope == "enterprise":
        fallback = base / version_name
        return str(fallback) if fallback.is_dir() else None
    return None


def _filter_model(classes: list[dict[str, Any]], model: str) -> list[dict[str, Any]]:
    return [
        item for item in classes
        if item.get("model") == model or model in (item.get("inherits") or []) or model == item["class"]
    ]


def _model_summary(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> str:
    return f"{len(before)} classes avant, {len(after)} classes après."


def _model_diff(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> dict[str, Any]:
    before_fields = {field for item in before for field in item.get("fields", [])}
    after_fields = {field for item in after for field in item.get("fields", [])}
    before_methods = {method for item in before for method in item.get("methods", [])}
    after_methods = {method for item in after for method in item.get("methods", [])}
    return {
        "fields_added": sorted(after_fields - before_fields),
        "fields_removed": sorted(before_fields - after_fields),
        "methods_added": sorted(after_methods - before_methods),
        "methods_removed": sorted(before_methods - after_methods),
        "files_before": sorted({item["path"] for item in before}),
        "files_after": sorted({item["path"] for item in after}),
    }


def _module_payload(info: dict[str, Any] | None) -> dict[str, Any] | None:
    if not info:
        return None
    manifest = info.get("manifest") or {}
    return {
        "path": info.get("path"),
        "name": manifest.get("name"),
        "version": manifest.get("version"),
        "depends": manifest.get("depends") or [],
        "data": manifest.get("data") or [],
        "demo": manifest.get("demo") or [],
        "installable": manifest.get("installable", True),
    }


def _module_summary(module: str, before: dict[str, Any] | None, after: dict[str, Any] | None) -> str:
    if before and after:
        return f"Module {module} présent dans les deux versions."
    if after:
        return f"Module {module} ajouté dans la version cible."
    if before:
        return f"Module {module} absent de la version cible."
    return f"Module {module} introuvable dans les deux versions."


def _manifest_diff(before: dict[str, Any] | None, after: dict[str, Any] | None) -> dict[str, Any]:
    left = _module_payload(before) or {}
    right = _module_payload(after) or {}
    return {
        "depends_added": sorted(set(right.get("depends", [])) - set(left.get("depends", []))),
        "depends_removed": sorted(set(left.get("depends", [])) - set(right.get("depends", []))),
        "data_added": sorted(set(right.get("data", [])) - set(left.get("data", []))),
        "data_removed": sorted(set(left.get("data", [])) - set(right.get("data", []))),
        "version_before": left.get("version"),
        "version_after": right.get("version"),
    }


def _file_delta(before: dict[str, Any] | None, after: dict[str, Any] | None) -> dict[str, list[str]]:
    def files(info: dict[str, Any] | None) -> set[str]:
        if not info:
            return set()
        root = Path(info["manifest_path"]).parent
        return {str(path.relative_to(root)) for path in root.rglob("*") if path.is_file() and ".git" not in path.parts}

    left = files(before)
    right = files(after)
    return {"added": sorted(right - left)[:500], "removed": sorted(left - right)[:500]}


def _view_summary(xml_id: str, before: dict[str, Any] | None, after: dict[str, Any] | None) -> str:
    if before and after:
        return f"Vue {xml_id} trouvée dans les deux versions."
    if after:
        return f"Vue {xml_id} ajoutée dans la version cible."
    if before:
        return f"Vue {xml_id} absente de la version cible."
    return f"Vue {xml_id} introuvable dans les deux versions."
