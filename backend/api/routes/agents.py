"""HTTP routes exposing the agent registry to the frontend.

Mounted under ``/api/agents``. Mirrors the shape of the ``/api/ai/skills``
endpoints so the Settings panel can render an Agents tab with the same UI
primitives (markdown body, migration addon, eval queries).
"""
from __future__ import annotations

from pathlib import Path
from fastapi import APIRouter, HTTPException

from ...agents import (
    list_agents,
    list_agent_issues,
    get_agent,
    load_eval_queries,
)

router = APIRouter()


def _agent_public(ag) -> dict:
    """Serialize an AgentDefinition for the frontend."""
    return {
        "name": ag.name,
        "folder_name": ag.folder_name,
        "label": ag.label,
        "label_en": ag.label_en,
        "description": ag.description,
        "description_en": ag.description_en,
        "icon": ag.icon,
        "color": ag.color,
        "default": ag.default,
        "builtin": ag.builtin,
        "version": ag.version,
        "author": ag.author,
        "aliases": list(ag.aliases),
        "modes": list(ag.modes),
        "recommended_model": ag.recommended_model,
        "preferred_skills": list(ag.preferred_skills),
        "avoided_skills": list(ag.avoided_skills),
        "denied_skills": list(ag.denied_skills),
        "preferred_tools": list(ag.preferred_tools),
        "scope": ag.scope,
        "agent_type": ag.agent_type,
        "handoff": {"can_handoff_to": list(ag.handoff_can_handoff_to)},
        "auto_keywords": {
            "weak": list(ag.auto_keywords.weak),
            "strong": list(ag.auto_keywords.strong),
        },
        "has_migration": bool(ag.migration_fr_file),
        "has_migration_en": bool(ag.migration_en_file),
        "has_eval_queries": bool(ag.eval_queries_file),
    }


@router.get("")
async def get_agents():
    """List all registered agents with their public metadata."""
    agents = list_agents()
    issues = [
        {"severity": i.severity, "agent": i.agent, "folder": i.folder,
         "code": i.code, "message": i.message, "field": i.field}
        for i in list_agent_issues()
    ]
    return {"agents": [_agent_public(a) for a in agents], "diagnostics": issues}


@router.get("/{name}")
async def get_agent_detail(name: str):
    ag = get_agent(name)
    if ag is None:
        raise HTTPException(404, "Agent inconnu")
    return _agent_public(ag)


@router.get("/{name}/markdown")
async def get_agent_markdown(name: str):
    """Raw AGENT.md (frontmatter + system-prompt body)."""
    ag = get_agent(name)
    if ag is None or not ag.folder:
        raise HTTPException(404, "Agent inconnu")
    agent_md = Path(ag.folder) / "AGENT.md"
    if not agent_md.is_file():
        raise HTTPException(404, "AGENT.md introuvable")
    return {"name": ag.name, "filename": "AGENT.md",
            "content": agent_md.read_text(encoding="utf-8")}


def _read_or_404(path: str | None, label: str) -> str:
    if not path:
        raise HTTPException(404, f"{label} introuvable")
    p = Path(path)
    if not p.is_file():
        raise HTTPException(404, f"{label} introuvable")
    return p.read_text(encoding="utf-8")


@router.get("/{name}/migration")
async def get_agent_migration(name: str, lang: str = "fr"):
    ag = get_agent(name)
    if ag is None:
        raise HTTPException(404, "Agent inconnu")
    path = ag.migration_en_file if (lang or "").lower() == "en" else ag.migration_fr_file
    content = _read_or_404(path, "Add-on migration")
    return {"name": ag.name, "lang": lang, "content": content}


@router.get("/{name}/eval-queries")
async def get_agent_eval_queries(name: str):
    ag = get_agent(name)
    if ag is None:
        raise HTTPException(404, "Agent inconnu")
    if not ag.eval_queries_file:
        return {"name": ag.name, "queries": {"positive": [], "negative": []}, "available": False}
    data = load_eval_queries(name)
    if not isinstance(data, dict):
        raise HTTPException(500, "eval_queries.json doit être un objet")
    return {"name": ag.name, "queries": data, "available": True}
