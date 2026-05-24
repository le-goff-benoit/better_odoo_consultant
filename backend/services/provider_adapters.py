"""Minimal provider capability adapters for the skill runtime.

The chat implementation still lives in ``ai_service.py``. These adapters make
provider differences explicit so the runtime can reason about capabilities and
execution mode without hard-coding that policy throughout the codebase.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal, Mapping, Optional

ExecutionMode = Literal["backend_emulated", "native"]


@dataclass(frozen=True)
class ProviderSkillCapabilities:
    native_skills: bool = False
    filesystem_access: bool = False
    bash_execution: bool = False
    code_execution: bool = False
    tool_calling: bool = True
    mcp_support: bool = False
    structured_output: bool = False
    max_context_tokens: Optional[int] = None


@dataclass(frozen=True)
class ProviderAdapter:
    provider: str
    execution_mode: ExecutionMode
    capabilities: ProviderSkillCapabilities
    tool_format: Literal["claude", "openai", "gemini"]

    def format_system(self, stable: str, variable: str) -> object:
        if self.tool_format == "claude":
            return stable, variable
        return f"{stable}\n\n{variable}".strip()

    def select_toolset(self, toolsets: Any):
        if self.tool_format == "claude":
            return toolsets.claude
        if self.tool_format == "openai":
            return toolsets.openai
        return toolsets.gemini

    def stream(self, streamers: Mapping[str, Callable[..., Any]], *args, **kwargs):
        streamer = streamers.get(self.provider)
        if streamer is None and self.tool_format == "openai":
            streamer = streamers.get("openai")
        if streamer is None:
            raise KeyError(f"No streamer registered for provider {self.provider}")
        return streamer(*args, **kwargs)


CLAUDE_ADAPTER = ProviderAdapter(
    provider="claude",
    execution_mode="backend_emulated",
    tool_format="claude",
    capabilities=ProviderSkillCapabilities(
        native_skills=False,
        tool_calling=True,
        structured_output=False,
    ),
)

OPENAI_ADAPTER = ProviderAdapter(
    provider="openai",
    execution_mode="backend_emulated",
    tool_format="openai",
    capabilities=ProviderSkillCapabilities(
        native_skills=False,
        tool_calling=True,
        structured_output=True,
    ),
)

GEMINI_ADAPTER = ProviderAdapter(
    provider="gemini",
    execution_mode="backend_emulated",
    tool_format="gemini",
    capabilities=ProviderSkillCapabilities(
        native_skills=False,
        tool_calling=True,
        structured_output=True,
    ),
)

OPENAI_COMPATIBLE_ADAPTERS = {
    "github": ProviderAdapter(
        provider="github",
        execution_mode="backend_emulated",
        tool_format="openai",
        capabilities=OPENAI_ADAPTER.capabilities,
    ),
    "copilot": ProviderAdapter(
        provider="copilot",
        execution_mode="backend_emulated",
        tool_format="openai",
        capabilities=OPENAI_ADAPTER.capabilities,
    ),
}

_ADAPTERS = {
    "claude": CLAUDE_ADAPTER,
    "openai": OPENAI_ADAPTER,
    "gemini": GEMINI_ADAPTER,
    **OPENAI_COMPATIBLE_ADAPTERS,
}


def get_provider_adapter(provider: str) -> Optional[ProviderAdapter]:
    return _ADAPTERS.get(provider)


def provider_capabilities(provider: str) -> Optional[ProviderSkillCapabilities]:
    adapter = get_provider_adapter(provider)
    return adapter.capabilities if adapter else None
