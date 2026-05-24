"""Provider toolset assembly for the backend-emulated skill runtime."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class ToolSetInputs:
    base_claude: list[dict[str, Any]]
    base_openai: list[dict[str, Any]]
    base_gemini: list[dict[str, Any]]
    repo_claude: list[dict[str, Any]]
    repo_openai: list[dict[str, Any]]
    repo_gemini_declarations: list[dict[str, Any]]
    target_claude: list[dict[str, Any]]
    target_openai: list[dict[str, Any]]
    target_gemini_declarations: list[dict[str, Any]]
    count_claude: list[dict[str, Any]]
    count_openai: list[dict[str, Any]]
    count_gemini_declarations: list[dict[str, Any]]
    studio_claude: list[dict[str, Any]]
    studio_openai: list[dict[str, Any]]
    studio_gemini_declarations: list[dict[str, Any]]
    view_claude: list[dict[str, Any]]
    view_openai: list[dict[str, Any]]
    view_gemini_declarations: list[dict[str, Any]]


@dataclass(frozen=True)
class ProviderToolSets:
    claude: list[dict[str, Any]]
    openai: list[dict[str, Any]]
    gemini: list[dict[str, Any]]
    exposed_skills: tuple[str, ...]


def _gemini_append(tools: list[dict[str, Any]], declarations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    current = list(tools[0].get("function_declarations", [])) if tools else []
    return [{"function_declarations": current + list(declarations)}]


def _tool_name(tool: dict[str, Any], tool_format: str) -> str | None:
    if tool_format == "claude":
        return tool.get("name")
    if tool_format == "openai":
        return (tool.get("function") or {}).get("name")
    return tool.get("name")


def _filter_claude(tools: list[dict[str, Any]], disabled: set[str]) -> list[dict[str, Any]]:
    return [tool for tool in tools if _tool_name(tool, "claude") not in disabled]


def _filter_openai(tools: list[dict[str, Any]], disabled: set[str]) -> list[dict[str, Any]]:
    return [tool for tool in tools if _tool_name(tool, "openai") not in disabled]


def _filter_gemini(tools: list[dict[str, Any]], disabled: set[str]) -> list[dict[str, Any]]:
    if not tools:
        return tools
    declarations = [
        fd for fd in tools[0].get("function_declarations", [])
        if _tool_name(fd, "gemini") not in disabled
    ]
    return [{"function_declarations": declarations}]


def _names_from_toolsets(claude: Iterable[dict[str, Any]], openai: Iterable[dict[str, Any]], gemini: list[dict[str, Any]]) -> tuple[str, ...]:
    names: list[str] = []
    for tool in claude:
        name = _tool_name(tool, "claude")
        if name and name not in names:
            names.append(name)
    for tool in openai:
        name = _tool_name(tool, "openai")
        if name and name not in names:
            names.append(name)
    for declaration in (gemini[0].get("function_declarations", []) if gemini else []):
        name = _tool_name(declaration, "gemini")
        if name and name not in names:
            names.append(name)
    return tuple(names)


def build_provider_toolsets(
    inputs: ToolSetInputs,
    *,
    repo_available: bool = False,
    source_available: bool = False,
    target_available: bool = False,
    live_odoo_available: bool = False,
    disabled_tools: list[str] | None = None,
) -> ProviderToolSets:
    """Assemble all provider tool formats from the same runtime conditions."""
    from ..skills.registry import normalize_disabled_skill_names

    disabled_names, _ignored_locked = normalize_disabled_skill_names(disabled_tools)
    disabled = set(disabled_names)
    claude = list(inputs.base_claude)
    openai = list(inputs.base_openai)
    gemini = list(inputs.base_gemini)

    if repo_available:
        claude += inputs.repo_claude
        openai += inputs.repo_openai
        gemini = _gemini_append(gemini, inputs.repo_gemini_declarations)

    if target_available:
        claude += inputs.target_claude
        openai += inputs.target_openai
        gemini = _gemini_append(gemini, inputs.target_gemini_declarations)

    if source_available or repo_available or target_available:
        claude += inputs.count_claude
        openai += inputs.count_openai
        gemini = _gemini_append(gemini, inputs.count_gemini_declarations)

    if live_odoo_available:
        claude += inputs.studio_claude + inputs.view_claude
        openai += inputs.studio_openai + inputs.view_openai
        gemini = _gemini_append(
            gemini,
            inputs.studio_gemini_declarations + inputs.view_gemini_declarations,
        )

    claude = _filter_claude(claude, disabled)
    openai = _filter_openai(openai, disabled)
    gemini = _filter_gemini(gemini, disabled)
    return ProviderToolSets(
        claude=claude,
        openai=openai,
        gemini=gemini,
        exposed_skills=_names_from_toolsets(claude, openai, gemini),
    )
