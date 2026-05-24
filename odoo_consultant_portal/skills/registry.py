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

SkillGroup = Literal["core", "live", "src", "target", "repo"]
SkillMode = Literal["assistant", "migration", "creator"]
SkillKind = Literal["tool", "core"]

_logger = logging.getLogger(__name__)
_SKILLS_DIR = Path(__file__).parent
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)


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


@dataclass(frozen=True)
class SkillReference:
    """A reference entry. ``triggers`` (if non-empty) enable EAGER loading:
    when one of these keywords matches the prompt, the dispatcher loads the
    reference content directly into the system prompt instead of waiting for
    the LLM to call ``load_skill_reference``."""
    file: str
    triggers: tuple[str, ...] = ()  # empty = lazy-only (on-demand via tool)


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
    context_file: str
    modes: tuple[SkillMode, ...]
    read_only: bool = True
    risk_level: Literal["low", "medium", "high"] = "low"
    keywords: tuple[str, ...] = ()
    kind: SkillKind = "tool"
    builtin: bool = False
    code_path: Optional[str] = None
    diagram: Optional[SkillDiagram] = None
    # Path to the folder backing this skill — useful for the body extractor
    # (default_contexts.py) and for future per-skill script loading.
    folder: Optional[str] = None
    body: str = ""
    # v0.61 — Anthropic-style content directories. Filenames only (relative to
    # the corresponding subfolder), not full paths.
    version: str = "0.1.0"
    tags: tuple[str, ...] = ()
    permissions: SkillPermissions = SkillPermissions()
    references: tuple[str, ...] = ()
    examples: tuple[str, ...] = ()
    scripts: tuple[str, ...] = ()
    templates: tuple[SkillTemplate, ...] = ()
    references_on_demand: bool = True
    # v0.63 — eager-loadable references: subset of ``references`` enriched with
    # prompt-matching triggers. Builds from the ``references_auto_load`` block
    # of the frontmatter; remaining files in ``references/`` are lazy-only.
    references_meta: tuple[SkillReference, ...] = ()


def _split_frontmatter(text: str) -> tuple[dict, str]:
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    meta = yaml.safe_load(m.group(1)) or {}
    if not isinstance(meta, dict):
        return {}, text
    return meta, m.group(2).lstrip()


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
    tags = tuple(meta.get("tags") or ())
    # Conventional context_file slug, kept for backward compat with the
    # context-file API and the user's existing customizations stored under
    # ~/.odoo-consultant/context/<context_file>.
    context_file = meta.get("context_file") or f"skill-{folder.name}.md"

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
        context_file=context_file,
        modes=modes,  # type: ignore[arg-type]
        read_only=bool(meta.get("read_only", True)),
        risk_level=str(meta.get("risk_level", "low")),  # type: ignore[arg-type]
        keywords=keywords,
        kind=str(meta.get("kind", "tool")),  # type: ignore[arg-type]
        builtin=bool(meta.get("builtin", False)),
        code_path=meta.get("code_path"),
        diagram=_load_diagram(folder),
        folder=str(folder),
        body=body,
        version=str(meta.get("version", "0.1.0")),
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
    "perspective-router",
    "context-aggregator",
    "skill-dispatcher",
    "project-context-refresh",
    "release-notes-injector",
    "complexity-analyzer",
    "localization-detector",
    "report-writer",
)


def _discover_skill_folders() -> list[Path]:
    folders = [
        p for p in _SKILLS_DIR.iterdir()
        if p.is_dir() and (p / "SKILL.md").is_file()
    ]
    by_slug = {p.name: p for p in folders}
    ordered: list[Path] = []
    for slug in _CORE_ORDER:
        if slug in by_slug:
            ordered.append(by_slug.pop(slug))
    ordered.extend(sorted(by_slug.values(), key=lambda p: p.name))
    return ordered


def _load_all() -> tuple[SkillDefinition, ...]:
    skills: list[SkillDefinition] = []
    for folder in _discover_skill_folders():
        raw = (folder / "SKILL.md").read_text(encoding="utf-8")
        meta, body = _split_frontmatter(raw)
        skill = _coerce_skill(folder, meta, body)
        if skill is not None:
            skills.append(skill)
    return tuple(skills)


SKILL_DEFINITIONS: tuple[SkillDefinition, ...] = _load_all()


def reload_skills() -> tuple[SkillDefinition, ...]:
    """Re-scan the skills directory. Useful in dev to pick up new folders."""
    global SKILL_DEFINITIONS
    SKILL_DEFINITIONS = _load_all()
    return SKILL_DEFINITIONS


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


def core_skill_names() -> set[str]:
    return {skill.name for skill in SKILL_DEFINITIONS if skill.kind == "core"}


def tool_skill_names() -> set[str]:
    return {skill.name for skill in SKILL_DEFINITIONS if skill.kind == "tool"}


def skill_catalog() -> list[dict]:
    items: list[dict] = []
    for skill in SKILL_DEFINITIONS:
        d = asdict(skill)
        # ``body`` is loaded into the registry but exposed separately through
        # the context-file API; no point shipping it twice in the catalog.
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
    skill = skill_by_name(name)
    if not skill:
        return None
    p = _safe_resolve(skill, "references", filename)
    return p.read_text(encoding="utf-8") if p else None


def read_skill_template(name: str, filename: str) -> Optional[str]:
    skill = skill_by_name(name)
    if not skill:
        return None
    # Accept "technical_review" or "technical_review.md".
    if not filename.endswith(".md"):
        filename = f"{filename}.md"
    p = _safe_resolve(skill, "templates", filename)
    return p.read_text(encoding="utf-8") if p else None


def read_skill_example(name: str, filename: str) -> Optional[str]:
    skill = skill_by_name(name)
    if not skill:
        return None
    p = _safe_resolve(skill, "examples", filename)
    return p.read_text(encoding="utf-8") if p else None


def resolve_skill_script(name: str, filename: str) -> Optional[Path]:
    """Return the absolute path to a script if the skill grants
    ``permissions.scripts`` and the file exists. The caller is responsible
    for actually running it (subprocess) — this function only validates."""
    skill = skill_by_name(name)
    if not skill or not skill.permissions.scripts:
        return None
    return _safe_resolve(skill, "scripts", filename)


def skill_by_name(name: str) -> Optional[SkillDefinition]:
    for skill in SKILL_DEFINITIONS:
        if skill.name == name:
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


def skill_body_by_context_file(filename: str) -> Optional[str]:
    """Backward-compat accessor: legacy code references the per-skill
    Markdown by its ``skill-<slug>.md`` filename. Resolve to the SKILL.md
    body of the matching folder."""
    for skill in SKILL_DEFINITIONS:
        if skill.context_file == filename:
            return skill.body or None
    return None
