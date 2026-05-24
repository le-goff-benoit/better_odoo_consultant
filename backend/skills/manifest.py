"""SKILL.md manifest parsing and minimal contract validation.

This module intentionally stays independent from ``registry.py``. The registry
owns runtime dataclasses; this parser owns the portable SKILL.md contract:
frontmatter, Markdown body, required fields and app-specific extension merging.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import yaml

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)
_RUNTIME_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

_APP_EXTENSION_KEYS = {
    "version",
    "author",
    "tags",
    "permissions",
    "outputs",
    "references_auto_load",
    "templates",
    "modes",
    "group",
    "kind",
    "builtin",
    "locked",
    "allow_implicit_invocation",
    "read_only",
    "risk_level",
    "code_path",
    "keywords",
    "aliases",
    "references_on_demand",
}


@dataclass(frozen=True)
class ParsedSkillManifest:
    """Normalized result of parsing one ``SKILL.md`` file."""

    meta: dict[str, Any]
    body: str
    errors: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    @property
    def valid(self) -> bool:
        return not self.errors


def _split_frontmatter(text: str) -> tuple[dict[str, Any], str, tuple[str, ...]]:
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text, ("missing YAML frontmatter",)
    try:
        meta = yaml.safe_load(match.group(1)) or {}
    except Exception as exc:
        return {}, match.group(2).lstrip(), (f"invalid YAML frontmatter: {exc}",)
    if not isinstance(meta, dict):
        return {}, match.group(2).lstrip(), ("YAML frontmatter must be a mapping",)
    return dict(meta), match.group(2).lstrip(), ()


def _merge_app_extensions(meta: dict[str, Any]) -> tuple[dict[str, Any], tuple[str, ...]]:
    """Merge optional ``x-app`` fields without overriding standard/root fields."""
    raw_ext = meta.get("x-app")
    if raw_ext is None:
        return meta, ()
    if not isinstance(raw_ext, dict):
        return meta, ("x-app must be a mapping when present",)

    normalized = dict(meta)
    warnings: list[str] = []
    for key, value in raw_ext.items():
        key = str(key)
        if key not in _APP_EXTENSION_KEYS:
            warnings.append(f"unknown x-app field ignored: {key}")
            continue
        normalized.setdefault(key, value)
    return normalized, tuple(warnings)


def _validate_minimal_contract(meta: dict[str, Any], body: str) -> tuple[str, ...]:
    errors: list[str] = []
    name = meta.get("name")
    description = meta.get("description")
    if not isinstance(name, str) or not name.strip():
        errors.append("missing required field: name")
    elif not _RUNTIME_NAME_RE.match(name.strip()):
        errors.append("name must be snake_case, start with a lowercase letter, and stay under 64 characters")

    if not isinstance(description, str) or not description.strip():
        errors.append("missing required field: description")

    if not body.strip():
        errors.append("SKILL.md body must contain Markdown instructions")
    return tuple(errors)


def normalize_permissions(raw: Any) -> dict[str, Any]:
    """Return safe permission defaults for invalid or missing permission values."""
    if not isinstance(raw, dict):
        return {"filesystem": "none", "network": False, "scripts": False, "odoo": "none"}
    filesystem = raw.get("filesystem", "none")
    if filesystem not in ("none", "read", "write"):
        filesystem = "none"
    odoo = raw.get("odoo", "none")
    if odoo not in ("none", "read", "write"):
        odoo = "none"
    return {
        "filesystem": filesystem,
        "network": bool(raw.get("network", False)),
        "scripts": bool(raw.get("scripts", False)),
        "odoo": odoo,
    }


def parse_skill_manifest(text: str) -> ParsedSkillManifest:
    """Parse and validate a ``SKILL.md`` document.

    Existing root-level app extensions remain supported. New app-specific
    fields can be placed under ``x-app`` and are merged only when the root
    field is absent, preserving backward compatibility.
    """
    meta, body, split_errors = _split_frontmatter(text)
    meta, merge_warnings = _merge_app_extensions(meta)
    if "permissions" in meta:
        meta["permissions"] = normalize_permissions(meta.get("permissions"))
    errors = tuple(split_errors) + _validate_minimal_contract(meta, body)
    return ParsedSkillManifest(meta=meta, body=body, errors=errors, warnings=merge_warnings)
