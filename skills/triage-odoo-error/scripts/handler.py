"""triage_odoo_error handler — classify an Odoo error/traceback into the
right root-cause family.

Strict separation of concerns:

* This handler is **deterministic**: regex + structured traceback parsing.
* It returns a verdict + evidence + parsed metadata + a single recommended
  next step. It NEVER suggests a fix — the calling LLM agent does that
  with the appropriate downstream skill (``source_read_odoo_file``,
  ``inspect_studio``, ``repo_search_code``, ``odoo_query_records``…).

Categories, in priority order (the first family with a strong signal
wins):

1. ``migration``   — schema / model drift between versions
2. ``studio``      — Studio Customization (UI-driven changes)
3. ``data``        — ValidationError / UserError / IntegrityError / FK
4. ``custom_dev``  — innermost frame in a non-standard module
5. ``source_code`` — innermost frame in Odoo standard (rare verdict)
6. ``unknown``     — nothing structural detected, ask for more context
"""
from __future__ import annotations

import re
from typing import Any


# ── Traceback parsing ─────────────────────────────────────────────

# Standard Python traceback frame:  File "path", line N, in func
_FRAME_RE = re.compile(r'File "([^"]+)", line (\d+), in (\S+)')

# Exception summary line at the bottom of a traceback, e.g.:
#   odoo.exceptions.ValidationError: ('Le total ne balance pas', ...)
#   psycopg2.errors.NotNullViolation: null value in column "name" ...
_EXC_RE = re.compile(
    r'(?:^|\n)\s*([\w.]+(?:Error|Exception|Violation|Warning)):\s*(.+?)\s*(?:\n|$)',
    re.MULTILINE,
)


def _parse_frames(text: str) -> list[tuple[str, int, str]]:
    """Return all `File "...", line N, in func` frames in order."""
    out: list[tuple[str, int, str]] = []
    for m in _FRAME_RE.finditer(text):
        out.append((m.group(1), int(m.group(2)), m.group(3)))
    return out


def _last_exception(text: str) -> tuple[str, str]:
    """Return (exception_class, exception_message) for the LAST exception
    line in the text — that's the one that actually killed the request."""
    last: tuple[str, str] = ("", "")
    for m in _EXC_RE.finditer(text):
        last = (m.group(1).strip(), m.group(2).strip())
    return last


# ── Path / module classification ──────────────────────────────────

# Files that are part of standard Odoo Community.
_STANDARD_PATH_HINTS = (
    "/odoo/odoo/",
    "/odoo/addons/",
    "site-packages/odoo/",
)
# Enterprise — separate so we can mention which licence layer is affected.
_ENTERPRISE_PATH_HINTS = (
    "/enterprise/",
    "odoo-enterprise/",
)
# Studio signals — anywhere in the trace.
_STUDIO_PATH_HINTS = (
    "/web_studio/",
    "/studio/",
    "studio_customization",
)


def _classify_path(path: str) -> str:
    """Return one of ``standard | enterprise | studio | custom``."""
    if not path:
        return "custom"
    p = path.replace("\\", "/")
    for hint in _STUDIO_PATH_HINTS:
        if hint in p:
            return "studio"
    for hint in _ENTERPRISE_PATH_HINTS:
        if hint in p:
            return "enterprise"
    for hint in _STANDARD_PATH_HINTS:
        if hint in p:
            return "standard"
    return "custom"


def _module_from_path(path: str) -> str:
    """Best-effort module name extraction from a frame path."""
    if not path:
        return ""
    p = path.replace("\\", "/")
    # /…/addons/<module>/…  or  /…/enterprise/<module>/…
    m = re.search(r"/(?:addons|enterprise|odoo)/([^/]+)/", p)
    if m:
        return m.group(1)
    # Fallback: take the parent directory name.
    parts = [seg for seg in p.split("/") if seg]
    return parts[-2] if len(parts) >= 2 else ""


# ── Signal detection ──────────────────────────────────────────────

# Migration signals — schema drift, model rename, upgrade scripts, etc.
_MIGRATION_SIGNALS = (
    (re.compile(r"Field\s+'[^']+'\s+does\s+not\s+exist\s+on\s+model", re.I), "field_does_not_exist_on_model"),
    (re.compile(r'column\s+"[^"]+"\s+does\s+not\s+exist', re.I), "pg_column_does_not_exist"),
    (re.compile(r'relation\s+"[^"]+"\s+does\s+not\s+exist', re.I), "pg_relation_does_not_exist"),
    (re.compile(r"\bExternal ID not found in the system:|\bir\.model\.data.*not found", re.I), "ir_model_data_missing"),
    (re.compile(r"openupgrade", re.I), "openupgrade_module"),
    (re.compile(r"/migrations?/\d+\.\d+", re.I), "upgrade_script_path"),
    (re.compile(r"\bUpgradeError\b|\bUpgradeRequiredError\b", re.I), "upgrade_exception"),
    (re.compile(r"\bParseError\b.*<field", re.I | re.S), "parse_error_on_legacy_view"),
)

# Studio signals — UI customisations carry their own fingerprints.
_STUDIO_SIGNALS = (
    (re.compile(r"\bx_studio_\w+", re.I), "x_studio_field"),
    (re.compile(r"\bstudio_customization\b", re.I), "studio_customization_module"),
    (re.compile(r"/web_studio/|/studio/", re.I), "web_studio_path"),
    (re.compile(r"\bweb_studio\.\w+", re.I), "web_studio_call"),
)

# Data signals — validations, constraints, FK, NULL. These usually point
# to bad data, not bad code.
_DATA_EXC_CLASSES = {
    "ValidationError", "UserError", "MissingError", "AccessError",
    "RedirectWarning", "Warning",
    "IntegrityError",
    "NotNullViolation", "ForeignKeyViolation", "UniqueViolation",
    "CheckViolation", "ExclusionViolation", "InvalidTextRepresentation",
}
_DATA_EXC_FQ_CLASSES = {
    "odoo.exceptions.ValidationError", "odoo.exceptions.UserError",
    "odoo.exceptions.MissingError", "odoo.exceptions.AccessError",
    "odoo.exceptions.RedirectWarning",
    "psycopg2.errors.NotNullViolation", "psycopg2.errors.ForeignKeyViolation",
    "psycopg2.errors.UniqueViolation", "psycopg2.errors.CheckViolation",
    "psycopg2.IntegrityError",
}
_DATA_SIGNALS = (
    (re.compile(r"\b_check_\w+\b"), "constraint_method"),
    (re.compile(r"@api\.constrains", re.I), "constrains_decorator_in_trace"),
    (re.compile(r"violates\s+(check|unique|foreign\s+key|not[-_\s]null)\s+constraint", re.I), "pg_constraint_violation"),
    (re.compile(r"\bnull value in column\b", re.I), "pg_null_value"),
)


def _has_signal(text: str, patterns: tuple) -> list[str]:
    hits: list[str] = []
    for pat, name in patterns:
        if pat.search(text):
            hits.append(name)
    return hits


# ── Next-step routing per verdict ─────────────────────────────────

_NEXT_STEPS = {
    "migration": (
        "compare_odoo_versions",
        "Comparer le modèle ou le champ entre la version source et la version cible pour vérifier le renommage / la suppression.",
    ),
    "studio": (
        "odoo_inspect_studio",
        "Lister les customisations Studio sur ce modèle pour identifier le champ ou la vue x_studio_* en cause.",
    ),
    "custom_dev": (
        "repo_search_code",
        "Chercher la définition du module / méthode dans le repo client pour localiser le défaut applicatif.",
    ),
    "source_code": (
        "source_read_odoo_file",
        "Lire le fichier standard Odoo à la ligne du frame innermost pour confirmer (et envisager source_show_commit pour vérifier les changements récents).",
    ),
    "data": (
        "odoo_query_records",
        "Interroger l'enregistrement qui déclenche la contrainte pour comprendre ce qui rend la donnée non conforme.",
    ),
    "unknown": (
        "",
        "Demander à l'utilisateur la trace complète, la version Odoo, et si Studio est utilisé sur cette base.",
    ),
}


def _migration_relevance(verdict: str, signals: dict[str, list[str]]) -> str:
    """When the call site is mid-migration, every verdict is informative —
    but the magnitude of the migration link is what helps the consultant
    prioritise. ``high`` means the error is unlikely to occur on a stable
    same-version base."""
    if verdict == "migration":
        return "high"
    if signals.get("migration"):
        return "medium"
    if verdict == "studio":
        # Studio breaks fairly often during migration (vue legacy, champ renommé).
        return "medium"
    if verdict == "custom_dev":
        return "medium"
    if verdict == "source_code":
        return "low"
    return "low"


# ── Main entry point ──────────────────────────────────────────────

async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    raw = str(args.get("text") or args.get("log") or args.get("traceback") or "").strip()
    if not raw:
        return {
            "ok": False,
            "error": "missing 'text' argument — paste the traceback or error log",
        }
    if len(raw) > 60000:
        raw = raw[:60000]  # bound the work; tracebacks longer than this are noise

    frames = _parse_frames(raw)
    exc_class, exc_message = _last_exception(raw)
    exc_short = exc_class.rsplit(".", 1)[-1] if exc_class else ""

    innermost_file = frames[-1][0] if frames else ""
    innermost_line = frames[-1][1] if frames else 0
    innermost_func = frames[-1][2] if frames else ""
    innermost_layer = _classify_path(innermost_file)
    innermost_module = _module_from_path(innermost_file)

    # Layer counts across all frames — used as confidence boosters.
    layer_counts = {"standard": 0, "enterprise": 0, "studio": 0, "custom": 0}
    for f, _, _ in frames:
        layer_counts[_classify_path(f)] += 1

    signals = {
        "migration": _has_signal(raw, _MIGRATION_SIGNALS),
        "studio": _has_signal(raw, _STUDIO_SIGNALS),
        "data": _has_signal(raw, _DATA_SIGNALS),
    }

    is_data_exc = (
        exc_short in _DATA_EXC_CLASSES
        or exc_class in _DATA_EXC_FQ_CLASSES
        or any(exc_class.endswith("." + c) for c in _DATA_EXC_CLASSES)
    )

    # ── Classification — priority order matters ──────────────────
    verdict = "unknown"
    why: list[str] = []

    if signals["migration"]:
        verdict = "migration"
        why.append(f"migration signals: {', '.join(signals['migration'])}")
    elif signals["studio"] or (frames and innermost_layer == "studio"):
        verdict = "studio"
        if signals["studio"]:
            why.append(f"studio signals: {', '.join(signals['studio'])}")
        if frames and innermost_layer == "studio":
            why.append("innermost frame in Studio code")
    elif is_data_exc or signals["data"]:
        # Data-class exceptions trump frame paths: a ValidationError raised
        # inside /odoo/addons/account/ is still a *data* problem, not a
        # source bug. This is the most common misclassification.
        verdict = "data"
        if is_data_exc:
            why.append(f"exception is a data class: {exc_class}")
        if signals["data"]:
            why.append(f"data signals: {', '.join(signals['data'])}")
    elif frames and innermost_layer == "custom":
        verdict = "custom_dev"
        why.append(f"innermost frame in non-standard module path: {innermost_file}")
    elif frames and innermost_layer in {"standard", "enterprise"}:
        verdict = "source_code"
        why.append(
            f"innermost frame in {innermost_layer} Odoo code ({innermost_module}), "
            f"no data/studio/migration signal detected"
        )
    elif frames:
        verdict = "unknown"
        why.append("frames parsed but no signal matched any rule")
    else:
        verdict = "unknown"
        why.append("no traceback frames could be parsed from input")

    # ── Confidence ───────────────────────────────────────────────
    # High: multiple corroborating signals OR a data exception class OR
    #       a migration signal OR a clear studio path + signal.
    # Medium: one signal only / verdict relies on innermost frame alone.
    # Low: no frames or just one weak signal.
    if verdict == "unknown" or not frames:
        confidence = "low"
    elif verdict == "migration" and len(signals["migration"]) >= 1:
        confidence = "high" if len(signals["migration"]) >= 2 else "medium"
    elif verdict == "data" and is_data_exc and (signals["data"] or layer_counts["custom"] == 0):
        confidence = "high"
    elif verdict == "studio" and (len(signals["studio"]) >= 2 or (signals["studio"] and innermost_layer == "studio")):
        confidence = "high"
    elif verdict in {"custom_dev", "source_code"} and len(frames) >= 3:
        confidence = "medium"
    else:
        confidence = "low"

    next_skill, next_reason = _NEXT_STEPS[verdict]

    return {
        "ok": True,
        "verdict": verdict,
        "confidence": confidence,
        "evidence": why,
        "parsed": {
            "exception_class": exc_class,
            "exception_message": exc_message,
            "innermost_file": innermost_file,
            "innermost_line": innermost_line,
            "innermost_function": innermost_func,
            "innermost_layer": innermost_layer,
            "module": innermost_module,
            "frame_count": len(frames),
            "layer_counts": layer_counts,
        },
        "signals": signals,
        "next_steps": {
            "skill": next_skill,
            "reason": next_reason,
        },
        "migration_relevance": _migration_relevance(verdict, signals),
    }
