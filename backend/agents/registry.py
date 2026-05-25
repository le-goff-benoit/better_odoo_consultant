"""Agent registry — folder-based loader for response personas.

Mirrors ``backend/skills/registry.py`` but for the simpler ``agents/`` layout
(no diagram, scripts, templates — just frontmatter + a few markdown bodies
and an optional eval_queries.json).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Optional

import yaml

_logger = logging.getLogger(__name__)
_AGENT_CATALOG_DIR = Path(__file__).resolve().parents[2] / "agents"

# Legacy aliases kept so that historical clients sending
# ``perspective="functional"`` or ``"technical"`` keep resolving correctly.
_LEGACY_ALIASES: dict[str, str] = {
    "functional": "business_analyst",
    "technical": "developer",
}

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)


@dataclass(frozen=True)
class AgentKeywords:
    weak: tuple[str, ...] = ()
    strong: tuple[str, ...] = ()


@dataclass(frozen=True)
class AgentDefinition:
    name: str                              # canonical slug, snake_case (e.g. "business_analyst")
    folder_name: str                       # on-disk folder name, kebab-case
    label: str
    label_en: str
    description: str
    description_en: str
    icon: str = "Sparkles"                 # Lucide icon name
    color: str = "#64748b"                 # hex
    default: bool = False
    builtin: bool = True
    version: str = "1.0.0"
    author: str = ""
    aliases: tuple[str, ...] = ()
    auto_keywords: AgentKeywords = AgentKeywords()
    recommended_model: Optional[str] = None
    preferred_skills: tuple[str, ...] = ()
    avoided_skills: tuple[str, ...] = ()    # soft −20 dispatcher malus
    denied_skills: tuple[str, ...] = ()     # hard-deny: removed from toolset
    preferred_tools: tuple[str, ...] = ()
    modes: tuple[str, ...] = ("assistant", "migration")
    scope: str = "core"                     # core | extension | experimental
    agent_type: str = "response_agent"      # response_agent | orchestrator | evaluator
    handoff_can_handoff_to: tuple[str, ...] = ()  # informational, future runtime
    folder: Optional[str] = None
    body: str = ""                         # FR system-prompt body
    body_en: str = ""                      # EN system-prompt body
    migration_fr_file: Optional[str] = None
    migration_en_file: Optional[str] = None
    eval_queries_file: Optional[str] = None


@dataclass(frozen=True)
class AgentRegistryIssue:
    severity: Literal["warning", "error"]
    agent: str
    folder: str
    code: str
    message: str
    field: Optional[str] = None


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    m = _FRONTMATTER_RE.match(text.lstrip("﻿"))
    if not m:
        return {}, text
    try:
        meta = yaml.safe_load(m.group(1)) or {}
    except Exception as exc:
        _logger.warning("Invalid YAML frontmatter: %s", exc)
        meta = {}
    if not isinstance(meta, dict):
        meta = {}
    return meta, m.group(2) or ""


def _coerce_keywords(raw: Any) -> AgentKeywords:
    if not isinstance(raw, dict):
        return AgentKeywords()
    def _t(key: str) -> tuple[str, ...]:
        v = raw.get(key) or ()
        if isinstance(v, (list, tuple)):
            return tuple(str(x).strip() for x in v if str(x).strip())
        return ()
    return AgentKeywords(weak=_t("weak"), strong=_t("strong"))


def _read_optional(folder: Path, name: str) -> tuple[str, Optional[str]]:
    f = folder / name
    if not f.is_file():
        return "", None
    try:
        return f.read_text(encoding="utf-8"), str(f)
    except Exception as exc:
        _logger.warning("Could not read %s: %s", f, exc)
        return "", str(f)


def _load_agent(folder: Path) -> Optional[AgentDefinition]:
    agent_md = folder / "AGENT.md"
    if not agent_md.is_file():
        return None
    try:
        raw = agent_md.read_text(encoding="utf-8")
    except Exception as exc:
        _logger.warning("Cannot read AGENT.md in %s: %s", folder, exc)
        return None
    meta, body = _parse_frontmatter(raw)
    name = meta.get("name")
    if not name or not isinstance(name, str):
        _logger.warning("Agent %s has no 'name' in frontmatter", folder.name)
        return None

    en_body, _ = _read_optional(folder, "AGENT.en.md")
    _, mig_fr = _read_optional(folder, "migration.md")
    _, mig_en = _read_optional(folder, "migration.en.md")
    eval_q = folder / "eval_queries.json"

    aliases_raw = meta.get("aliases") or ()
    aliases: tuple[str, ...] = ()
    if isinstance(aliases_raw, (list, tuple)):
        aliases = tuple(str(a).strip() for a in aliases_raw if str(a).strip())

    handoff_raw = meta.get("handoff") or {}
    handoff_targets: tuple[str, ...] = ()
    if isinstance(handoff_raw, dict):
        targets = handoff_raw.get("can_handoff_to") or ()
        if isinstance(targets, (list, tuple)):
            handoff_targets = tuple(str(t).strip() for t in targets if str(t).strip())

    return AgentDefinition(
        name=name,
        folder_name=folder.name,
        label=str(meta.get("label", name)),
        label_en=str(meta.get("label_en", meta.get("label", name))),
        description=str(meta.get("description", "")),
        description_en=str(meta.get("description_en", meta.get("description", ""))),
        icon=str(meta.get("icon", "Sparkles")),
        color=str(meta.get("color", "#64748b")),
        default=bool(meta.get("default", False)),
        builtin=bool(meta.get("builtin", True)),
        version=str(meta.get("version", "1.0.0")),
        author=str(meta.get("author", "")),
        aliases=aliases,
        auto_keywords=_coerce_keywords(meta.get("auto_keywords")),
        recommended_model=(str(meta.get("recommended_model")) if meta.get("recommended_model") else None),
        preferred_skills=tuple(str(s) for s in (meta.get("preferred_skills") or ()) if str(s).strip()),
        avoided_skills=tuple(str(s) for s in (meta.get("avoided_skills") or ()) if str(s).strip()),
        denied_skills=tuple(str(s) for s in (meta.get("denied_skills") or ()) if str(s).strip()),
        preferred_tools=tuple(str(t) for t in (meta.get("preferred_tools") or ()) if str(t).strip()),
        modes=tuple(str(m) for m in (meta.get("modes") or ("assistant", "migration")) if str(m).strip()),
        scope=str(meta.get("scope", "core")),
        agent_type=str(meta.get("agent_type", "response_agent")),
        handoff_can_handoff_to=handoff_targets,
        folder=str(folder),
        body=body.strip(),
        body_en=en_body.strip(),
        migration_fr_file=mig_fr,
        migration_en_file=mig_en,
        eval_queries_file=str(eval_q) if eval_q.is_file() else None,
    )


@lru_cache(maxsize=1)
def _load_all() -> tuple[tuple[AgentDefinition, ...], tuple[AgentRegistryIssue, ...]]:
    if not _AGENT_CATALOG_DIR.is_dir():
        _logger.warning("Agent catalog directory missing: %s", _AGENT_CATALOG_DIR)
        return (), ()
    folders = sorted(
        p for p in _AGENT_CATALOG_DIR.iterdir()
        if p.is_dir() and (p / "AGENT.md").is_file()
    )
    agents: list[AgentDefinition] = []
    issues: list[AgentRegistryIssue] = []
    seen_names: dict[str, str] = {}
    default_count = 0
    for folder in folders:
        ag = _load_agent(folder)
        if not ag:
            issues.append(AgentRegistryIssue(
                severity="error", agent=folder.name, folder=folder.name,
                code="load_failed", message="AGENT.md illisible ou sans 'name'.",
            ))
            continue
        if ag.name in seen_names:
            issues.append(AgentRegistryIssue(
                severity="error", agent=ag.name, folder=folder.name, code="duplicate_name",
                message=f"name '{ag.name}' déjà déclaré par {seen_names[ag.name]}",
            ))
            continue
        seen_names[ag.name] = folder.name
        agents.append(ag)
        if ag.default:
            default_count += 1
        if not ag.body:
            issues.append(AgentRegistryIssue(
                severity="warning", agent=ag.name, folder=folder.name, code="empty_body",
                message="AGENT.md sans corps Markdown (system prompt FR vide).",
            ))
    if default_count == 0 and agents:
        issues.append(AgentRegistryIssue(
            severity="warning", agent="*", folder="-", code="no_default",
            message="Aucun agent marqué default:true ; le premier sera utilisé.",
        ))
    elif default_count > 1:
        issues.append(AgentRegistryIssue(
            severity="warning", agent="*", folder="-", code="multiple_defaults",
            message="Plusieurs agents marqués default:true ; le premier l'emporte.",
        ))
    return tuple(agents), tuple(issues)


def list_agents() -> tuple[AgentDefinition, ...]:
    return _load_all()[0]


def list_agent_issues() -> tuple[AgentRegistryIssue, ...]:
    return _load_all()[1]


def _name_index() -> dict[str, AgentDefinition]:
    idx: dict[str, AgentDefinition] = {}
    for ag in list_agents():
        idx[ag.name] = ag
        for alias in ag.aliases:
            idx.setdefault(alias, ag)
        idx.setdefault(ag.folder_name, ag)
    for alias, target in _LEGACY_ALIASES.items():
        if alias not in idx and target in idx:
            idx[alias] = idx[target]
    return idx


def get_agent(name: Optional[str]) -> Optional[AgentDefinition]:
    if not name:
        return None
    return _name_index().get(name)


def resolve_agent(name: Optional[str]) -> AgentDefinition:
    """Return the agent matching *name*, falling back to the default agent
    (or the first declared agent) when *name* is unknown or empty."""
    ag = get_agent(name)
    if ag is not None:
        return ag
    agents = list_agents()
    for a in agents:
        if a.default:
            return a
    if agents:
        return agents[0]
    raise RuntimeError("No agents found in agents/ catalog")


def default_agent_name() -> str:
    return resolve_agent(None).name


def reload_agents() -> None:
    """Drop the LRU cache — used by tests."""
    _load_all.cache_clear()


def load_eval_queries(name: str) -> dict:
    ag = get_agent(name)
    if ag is None or not ag.eval_queries_file:
        return {}
    try:
        return json.loads(Path(ag.eval_queries_file).read_text(encoding="utf-8"))
    except Exception as exc:
        _logger.warning("Cannot read eval_queries for %s: %s", name, exc)
        return {}
