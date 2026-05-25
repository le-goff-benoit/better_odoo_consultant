"""Agent registry — response personas (support, BA, architect, developer, …).

Each agent lives in its own folder under ``agents/<slug>/`` and is fully
self-contained, mirroring the skills convention:

* ``AGENT.md``           — YAML frontmatter (metadata) + Markdown body
                            (system prompt block injected at each turn, FR)
* ``AGENT.en.md``        — English system prompt body (no frontmatter)
* ``migration.md`` / ``migration.en.md`` — optional migration-mode addon
                            appended to the system prompt
* ``eval_queries.json``  — routing test fixtures (positive + negative prompts)

Add a new agent = create a folder with an ``AGENT.md``. No code change is
required beyond optional updates to the dispatcher if the agent needs
custom routing.
"""
from .registry import (
    AgentDefinition,
    AgentRegistryIssue,
    get_agent,
    list_agents,
    list_agent_issues,
    resolve_agent,
    default_agent_name,
    load_eval_queries,
    reload_agents,
)

__all__ = [
    "AgentDefinition",
    "AgentRegistryIssue",
    "get_agent",
    "list_agents",
    "list_agent_issues",
    "resolve_agent",
    "default_agent_name",
    "load_eval_queries",
    "reload_agents",
]
