"""Skill registry — Anthropic-style folder layout.

Each skill lives in its own folder under ``skills/<slug>/`` and is fully
self-contained:

* ``SKILL.md``           — YAML frontmatter (metadata) + Markdown body (playbook)
* ``diagram/diagram.yaml`` — structured high-level diagram (inputs/steps/outputs)
* ``scripts/``            — Python logic backing the skill (executors, helpers)
* ``references/``         — optional reference docs
* ``templates/``          — optional output templates
* ``assets/``             — optional binary assets

This module is a pure loader: it discovers folders, parses their frontmatter
and diagram, and exposes the resulting ``SkillDefinition`` tuple. To add a
new skill, create a folder — no edit to this file is required.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal, Optional

import yaml

from .manifest import parse_skill_manifest

SkillGroup = Literal["core", "live", "src", "target", "repo"]
SkillMode = Literal["assistant", "migration", "creator"]
SkillKind = Literal["tool", "core"]

_logger = logging.getLogger(__name__)
_SKILL_CATALOG_DIR = Path(__file__).resolve().parents[2] / "skills"


@dataclass(frozen=True)
class SkillDiagram:
    inputs: tuple[str, ...]
    steps: tuple[str, ...]
    outputs: tuple[str, ...]
    inputs_en: tuple[str, ...] = ()
    steps_en: tuple[str, ...] = ()
    outputs_en: tuple[str, ...] = ()
    notes: Optional[str] = None
    notes_en: Optional[str] = None


@dataclass(frozen=True)
class SkillPermissions:
    """Declarative permissions for a skill — enforced when the LLM invokes
    ``load_skill_reference`` or ``run_skill_script``. Safe defaults: nothing
    granted unless explicitly stated in the SKILL.md frontmatter."""
    filesystem: Literal["none", "read", "write"] = "none"
    network: bool = False
    scripts: bool = False
    odoo: Literal["none", "read", "write"] = "none"


@dataclass(frozen=True)
class SkillTemplate:
    """A skill template = a Markdown output format the LLM is asked to follow."""
    name: str           # filename without extension (e.g. "technical_review")
    label: str          # human label (e.g. "Revue technique")
    triggers: tuple[str, ...] = ()  # prompt keywords that auto-select this template
    # Agents (perspectives) for which this template is the natural choice.
    # When a prompt matches triggers from several templates and one of them
    # lists the active agent, that template wins. Empty tuple = no agent
    # preference (legacy default, matches any agent).
    preferred_agents: tuple[str, ...] = ()
    # Agents for which this template is NOT appropriate even when a trigger
    # matches — e.g. a `technical_review` template forced on a BA prompt
    # would dump file:line and Python patches when the BA wants business
    # framing. Listed agents will skip this template (selection falls back
    # to other templates or to no template at all).
    forbidden_agents: tuple[str, ...] = ()


@dataclass(frozen=True)
class SkillReference:
    """A reference entry. ``triggers`` (if non-empty) enable EAGER loading:
    when one of these keywords matches the prompt, the dispatcher loads the
    reference content directly into the system prompt instead of waiting for
    the LLM to call ``load_skill_reference``."""
    file: str
    triggers: tuple[str, ...] = ()  # empty = lazy-only (on-demand via tool)


@dataclass(frozen=True)
class SkillRegistryIssue:
    severity: Literal["warning", "error"]
    skill: str
    folder: str
    code: str
    message: str
    field: Optional[str] = None


@dataclass(frozen=True)
class SkillDefinition:
    name: str
    label: str
    label_en: str
    group: SkillGroup
    description: str
    description_en: str
    requirement: str
    requirement_en: str
    modes: tuple[SkillMode, ...]
    read_only: bool = True
    risk_level: Literal["low", "medium", "high"] = "low"
    keywords: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()
    kind: SkillKind = "tool"
    builtin: bool = False
    code_path: Optional[str] = None
    diagram: Optional[SkillDiagram] = None
    # Path to the folder backing this skill — useful for per-skill content
    # and script loading.
    folder: Optional[str] = None
    body: str = ""
    # v0.61 — Anthropic-style content directories. Filenames only (relative to
    # the corresponding subfolder), not full paths.
    version: str = "0.1.0"
    author: str = ""
    tags: tuple[str, ...] = ()
    permissions: SkillPermissions = SkillPermissions()
    references: tuple[str, ...] = ()
    examples: tuple[str, ...] = ()
    scripts: tuple[str, ...] = ()
    templates: tuple[SkillTemplate, ...] = ()
    references_on_demand: bool = True
    locked: bool = False
    allow_implicit_invocation: bool = True
    # v0.63 — eager-loadable references: subset of ``references`` enriched with
    # prompt-matching triggers. Builds from the ``references_auto_load`` block
    # of the frontmatter; remaining files in ``references/`` are lazy-only.
    references_meta: tuple[SkillReference, ...] = ()


def _load_diagram(folder: Path) -> Optional[SkillDiagram]:
    f = folder / "diagram" / "diagram.yaml"
    if not f.exists():
        return None
    try:
        data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        _logger.warning("Invalid diagram.yaml in %s: %s", folder.name, exc)
        return None

    def _t(key: str) -> tuple[str, ...]:
        v = data.get(key)
        if not v:
            return ()
        if isinstance(v, list):
            return tuple(str(x) for x in v)
        return (str(v),)

    return SkillDiagram(
        inputs=_t("inputs"),
        steps=_t("steps"),
        outputs=_t("outputs"),
        inputs_en=_t("inputs_en"),
        steps_en=_t("steps_en"),
        outputs_en=_t("outputs_en"),
        notes=data.get("notes"),
        notes_en=data.get("notes_en"),
    )


def _scan_files(folder: Path, subdir: str, suffix: str = ".md") -> tuple[str, ...]:
    """List filenames (basename only) in a skill subfolder, sorted alphabetically.
    Skips .gitkeep and hidden files. Returns an empty tuple if the folder is
    missing or empty so the caller can treat any skill uniformly."""
    d = folder / subdir
    if not d.is_dir():
        return ()
    files = sorted(
        p.name for p in d.iterdir()
        if p.is_file() and not p.name.startswith(".") and p.name.endswith(suffix)
    )
    return tuple(files)


def _coerce_permissions(raw: Any) -> SkillPermissions:
    if not isinstance(raw, dict):
        return SkillPermissions()
    fs = raw.get("filesystem", "none")
    if fs not in ("none", "read", "write"):
        fs = "none"
    odoo = raw.get("odoo", "none")
    if odoo not in ("none", "read", "write"):
        odoo = "none"
    return SkillPermissions(
        filesystem=fs,  # type: ignore[arg-type]
        network=bool(raw.get("network", False)),
        scripts=bool(raw.get("scripts", False)),
        odoo=odoo,  # type: ignore[arg-type]
    )


def _coerce_templates(raw: Any, available: tuple[str, ...]) -> tuple[SkillTemplate, ...]:
    """Build the templates list from frontmatter + available files. Frontmatter
    entries enrich label/triggers; files not declared in frontmatter still
    appear with a sensible default label so the UI shows everything."""
    declared: dict[str, SkillTemplate] = {}
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict) and "name" in item:
                nm = str(item["name"])
                declared[nm] = SkillTemplate(
                    name=nm,
                    label=str(item.get("label", nm.replace("_", " ").capitalize())),
                    triggers=tuple(item.get("triggers") or ()),
                    preferred_agents=tuple(str(a) for a in (item.get("preferred_agents") or ())),
                    forbidden_agents=tuple(str(a) for a in (item.get("forbidden_agents") or ())),
                )
            elif isinstance(item, str):
                declared[item] = SkillTemplate(
                    name=item,
                    label=item.replace("_", " ").capitalize(),
                )
    out: list[SkillTemplate] = []
    seen: set[str] = set()
    # First the declared ones (frontmatter order is meaningful for UI).
    for tpl in declared.values():
        out.append(tpl)
        seen.add(tpl.name)
    # Then the on-disk templates not declared in frontmatter.
    for fname in available:
        base = fname.rsplit(".", 1)[0]
        if base in seen:
            continue
        out.append(SkillTemplate(name=base, label=base.replace("_", " ").capitalize()))
    return tuple(out)


def _coerce_references_meta(raw: Any, available: tuple[str, ...]) -> tuple[SkillReference, ...]:
    """Build the references_meta list from the optional ``references_auto_load``
    frontmatter block. References declared with triggers are eager-loadable;
    references present on disk but absent from the block stay lazy-only.

    Returns one ``SkillReference`` per file in ``available``: those with
    triggers will be eager-loaded when the prompt matches, the others will
    keep the existing lazy behavior."""
    declared: dict[str, SkillReference] = {}
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict) and "file" in item:
                fname = str(item["file"])
                declared[fname] = SkillReference(
                    file=fname,
                    triggers=tuple(str(t) for t in (item.get("triggers") or ())),
                )
    out: list[SkillReference] = []
    for fname in available:
        if fname in declared:
            out.append(declared[fname])
        else:
            out.append(SkillReference(file=fname))
    return tuple(out)


def _coerce_skill(folder: Path, meta: dict, body: str) -> Optional[SkillDefinition]:
    name = meta.get("name")
    if not name or not isinstance(name, str):
        _logger.warning("Skill %s has no 'name' in frontmatter", folder.name)
        return None
    modes = tuple(meta.get("modes") or ())
    keywords = tuple(meta.get("keywords") or ())
    aliases = tuple(str(a) for a in (meta.get("aliases") or ()) if str(a).strip())
    tags = tuple(meta.get("tags") or ())

    references = _scan_files(folder, "references", ".md")
    examples = _scan_files(folder, "examples", ".md")
    template_files = _scan_files(folder, "templates", ".md")
    scripts = _scan_files(folder, "scripts", ".py")

    return SkillDefinition(
        name=name,
        label=str(meta.get("label", name)),
        label_en=str(meta.get("label_en", meta.get("label", name))),
        group=str(meta.get("group", "live")),  # type: ignore[arg-type]
        description=str(meta.get("description", "")),
        description_en=str(meta.get("description_en", meta.get("description", ""))),
        requirement=str(meta.get("requirement", "")),
        requirement_en=str(meta.get("requirement_en", meta.get("requirement", ""))),
        modes=modes,  # type: ignore[arg-type]
        read_only=bool(meta.get("read_only", True)),
        risk_level=str(meta.get("risk_level", "low")),  # type: ignore[arg-type]
        keywords=keywords,
        aliases=aliases,
        kind=str(meta.get("kind", "tool")),  # type: ignore[arg-type]
        builtin=bool(meta.get("builtin", False)),
        locked=bool(meta.get("locked", meta.get("builtin", False))),
        allow_implicit_invocation=bool(meta.get("allow_implicit_invocation", True)),
        code_path=meta.get("code_path"),
        diagram=_load_diagram(folder),
        folder=str(folder),
        body=body,
        version=str(meta.get("version", "0.1.0")),
        author=str(meta.get("author", "")),
        tags=tags,
        permissions=_coerce_permissions(meta.get("permissions")),
        references=references,
        examples=examples,
        scripts=scripts,
        templates=_coerce_templates(meta.get("templates"), template_files),
        references_on_demand=bool(meta.get("references_on_demand", True)),
        references_meta=_coerce_references_meta(meta.get("references_auto_load"), references),
    )


# Skills cœur sont rangés en tête de la liste (ordre fixe) ; les autres
# suivent dans l'ordre alphabétique du dossier. Ordre stable et prévisible
# pour l'UI sans dépendre du système de fichiers.
_CORE_ORDER = (
    "runtime-perspective-router",
    "runtime-context-aggregator",
    "runtime-skill-dispatcher",
    "runtime-project-context-refresh",
    "runtime-release-notes-injector",
    "runtime-complexity-analyzer",
    "runtime-localization-detector",
    "output-report-writer",
    "runtime-attachment-handler",
)


def _discover_skill_folders() -> list[Path]:
    if not _SKILL_CATALOG_DIR.is_dir():
        _logger.warning("Skill catalog directory missing: %s", _SKILL_CATALOG_DIR)
        return []
    folders = [
        p for p in _SKILL_CATALOG_DIR.iterdir()
        if p.is_dir() and (p / "SKILL.md").is_file()
    ]
    by_slug = {p.name: p for p in folders}
    ordered: list[Path] = []
    for slug in _CORE_ORDER:
        if slug in by_slug:
            ordered.append(by_slug.pop(slug))
    ordered.extend(sorted(by_slug.values(), key=lambda p: p.name))
    return ordered


def _validate_skill(skill: SkillDefinition) -> list[SkillRegistryIssue]:
    issues: list[SkillRegistryIssue] = []
    folder = Path(skill.folder).name if skill.folder else skill.name
    if skill.kind == "tool" and not skill.code_path:
        issues.append(SkillRegistryIssue(
            severity="warning",
            skill=skill.name,
            folder=folder,
            code="missing_code_path",
            field="code_path",
            message="Skill tool sans code_path déclaré.",
        ))
    if skill.code_path:
        root = _SKILL_CATALOG_DIR.parent.resolve()
        target = (root / skill.code_path).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            issues.append(SkillRegistryIssue(
                severity="error",
                skill=skill.name,
                folder=folder,
                code="code_path_outside_repo",
                field="code_path",
                message=f"code_path sort du repository : {skill.code_path}",
            ))
        else:
            if not target.is_file():
                issues.append(SkillRegistryIssue(
                    severity="error",
                    skill=skill.name,
                    folder=folder,
                    code="code_path_missing",
                    field="code_path",
                    message=f"code_path introuvable : {skill.code_path}",
                ))
    return issues


def _deduplicate_loaded_skills(skills: list[SkillDefinition]) -> tuple[tuple[SkillDefinition, ...], list[SkillRegistryIssue]]:
    issues: list[SkillRegistryIssue] = []
    loaded: list[SkillDefinition] = []
    names: dict[str, SkillDefinition] = {}
    aliases: dict[str, SkillDefinition] = {}
    for skill in skills:
        folder = Path(skill.folder).name if skill.folder else skill.name
        existing = names.get(skill.name)
        if existing is not None:
            issues.append(SkillRegistryIssue(
                severity="error",
                skill=skill.name,
                folder=folder,
                code="duplicate_name",
                field="name",
                message=(
                    f"Nom de skill dupliqué avec {Path(existing.folder).name if existing.folder else existing.name}. "
                    "Le doublon est ignoré pour garder un runtime déterministe."
                ),
            ))
            continue
        duplicate_aliases = [alias for alias in skill.aliases if alias in aliases or alias in names]
        if duplicate_aliases:
            issues.append(SkillRegistryIssue(
                severity="error",
                skill=skill.name,
                folder=folder,
                code="duplicate_alias",
                field="aliases",
                message=(
                    "Alias dupliqué(s) ou ambigu(s) : "
                    + ", ".join(sorted(duplicate_aliases))
                    + ". Le skill est chargé, mais canonical_skill_name restera déterministe via le premier déclarant."
                ),
            ))
        loaded.append(skill)
        names[skill.name] = skill
        for alias in skill.aliases:
            aliases.setdefault(alias, skill)
    return tuple(loaded), issues


def _load_all_with_diagnostics() -> tuple[tuple[SkillDefinition, ...], tuple[SkillRegistryIssue, ...]]:
    skills: list[SkillDefinition] = []
    issues: list[SkillRegistryIssue] = []
    for folder in _discover_skill_folders():
        raw = (folder / "SKILL.md").read_text(encoding="utf-8")
        manifest = parse_skill_manifest(raw)
        for warning in manifest.warnings:
            _logger.warning("Skill %s manifest warning: %s", folder.name, warning)
            issues.append(SkillRegistryIssue(
                severity="warning",
                skill=str(manifest.meta.get("name") or folder.name),
                folder=folder.name,
                code="manifest_warning",
                message=warning,
            ))
        if not manifest.valid:
            _logger.warning(
                "Skill %s manifest invalid: %s",
                folder.name,
                "; ".join(manifest.errors),
            )
            for error in manifest.errors:
                issues.append(SkillRegistryIssue(
                    severity="error",
                    skill=str(manifest.meta.get("name") or folder.name),
                    folder=folder.name,
                    code="manifest_invalid",
                    message=error,
                ))
            continue
        skill = _coerce_skill(folder, manifest.meta, manifest.body)
        if skill is not None:
            issues.extend(_validate_skill(skill))
            skills.append(skill)
    loaded, duplicate_issues = _deduplicate_loaded_skills(skills)
    issues.extend(duplicate_issues)
    return loaded, tuple(issues)


def _load_all() -> tuple[SkillDefinition, ...]:
    return _load_all_with_diagnostics()[0]


SKILL_DEFINITIONS, SKILL_REGISTRY_ISSUES = _load_all_with_diagnostics()


def reload_skills() -> tuple[SkillDefinition, ...]:
    """Re-scan the skills directory. Useful in dev to pick up new folders."""
    global SKILL_DEFINITIONS, SKILL_REGISTRY_ISSUES
    SKILL_DEFINITIONS, SKILL_REGISTRY_ISSUES = _load_all_with_diagnostics()
    return SKILL_DEFINITIONS


def skill_registry_diagnostics() -> list[dict]:
    return [asdict(issue) for issue in SKILL_REGISTRY_ISSUES]


def _diagram_to_dict(d: Optional[SkillDiagram]) -> Optional[dict]:
    if d is None:
        return None
    return {
        "inputs": list(d.inputs),
        "steps": list(d.steps),
        "outputs": list(d.outputs),
        "inputs_en": list(d.inputs_en or d.inputs),
        "steps_en": list(d.steps_en or d.steps),
        "outputs_en": list(d.outputs_en or d.outputs),
        "notes": d.notes,
        "notes_en": d.notes_en or d.notes,
    }


def skill_names() -> set[str]:
    return {skill.name for skill in SKILL_DEFINITIONS}


def skill_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}
    for skill in SKILL_DEFINITIONS:
        for alias in skill.aliases:
            aliases[alias] = skill.name
    return aliases


def canonical_skill_name(name: str) -> Optional[str]:
    for skill in SKILL_DEFINITIONS:
        if skill.name == name or name in skill.aliases:
            return skill.name
    return None


def core_skill_names() -> set[str]:
    return {skill.name for skill in SKILL_DEFINITIONS if skill.kind == "core"}


def tool_skill_names() -> set[str]:
    return {skill.name for skill in SKILL_DEFINITIONS if skill.kind == "tool"}


def locked_skill_names() -> set[str]:
    return {skill.name for skill in SKILL_DEFINITIONS if skill.locked}


def normalize_disabled_skill_names(disabled_tools: Optional[list[str]]) -> tuple[list[str], list[str]]:
    known = skill_names()
    locked = locked_skill_names()
    disabled: list[str] = []
    ignored_locked: list[str] = []
    for name in dict.fromkeys(disabled_tools or []):
        if not isinstance(name, str):
            continue
        canonical = canonical_skill_name(name)
        if canonical not in known:
            continue
        if canonical in locked:
            ignored_locked.append(canonical)
            continue
        disabled.append(canonical)
    return disabled, ignored_locked


def skill_catalog() -> list[dict]:
    items: list[dict] = []
    for skill in SKILL_DEFINITIONS:
        d = asdict(skill)
        # ``body`` is loaded into the registry for runtime prompt assembly,
        # but the catalog only needs public metadata.
        d.pop("body", None)
        d.pop("folder", None)  # local filesystem path — not useful to the UI
        d["diagram"] = _diagram_to_dict(skill.diagram)
        d["templates"] = [asdict(t) for t in skill.templates]
        items.append(d)
    return items


_FILENAME_RE = re.compile(r"^[A-Za-z0-9_-]+\.(md|py)$")


def _safe_resolve(skill: SkillDefinition, subdir: str, filename: str) -> Optional[Path]:
    """Resolve ``skills/<slug>/<subdir>/<filename>`` defensively. Returns
    None when the filename is suspicious (path traversal) or the file does
    not exist under the expected folder."""
    if not skill.folder or not _FILENAME_RE.match(filename):
        return None
    base = Path(skill.folder) / subdir
    target = (base / filename).resolve()
    try:
        target.relative_to(base.resolve())
    except ValueError:
        return None
    if not target.is_file():
        return None
    return target


def read_skill_reference(name: str, filename: str) -> Optional[str]:
    from ..services.skill_loader import DEFAULT_SKILL_LOADER

    result = DEFAULT_SKILL_LOADER.load_reference(name, filename, enforce_policy=False)
    return result.content if result.ok else None


def read_skill_template(name: str, filename: str) -> Optional[str]:
    from ..services.skill_loader import DEFAULT_SKILL_LOADER

    result = DEFAULT_SKILL_LOADER.load_template(name, filename, enforce_policy=False)
    return result.content if result.ok else None


def read_skill_example(name: str, filename: str) -> Optional[str]:
    from ..services.skill_loader import DEFAULT_SKILL_LOADER

    result = DEFAULT_SKILL_LOADER.load_example(name, filename, enforce_policy=False)
    return result.content if result.ok else None


def resolve_skill_script(name: str, filename: str) -> Optional[Path]:
    """Return the absolute path to a script if the skill grants
    ``permissions.scripts`` and the file exists. The caller is responsible
    for actually running it (subprocess) — this function only validates."""
    from ..services.skill_loader import DEFAULT_SKILL_LOADER

    result = DEFAULT_SKILL_LOADER.resolve_script(name, filename)
    return result.path if result.ok else None


def skill_by_name(name: str) -> Optional[SkillDefinition]:
    for skill in SKILL_DEFINITIONS:
        if skill.name == name or name in skill.aliases:
            return skill
    return None


def skill_diagram(name: str) -> Optional[dict]:
    skill = skill_by_name(name)
    if not skill:
        return None
    return _diagram_to_dict(skill.diagram)


def skill_body(name: str) -> Optional[str]:
    """Return the Markdown body (playbook) of a skill, loaded from SKILL.md."""
    skill = skill_by_name(name)
    if not skill:
        return None
    return skill.body or None

