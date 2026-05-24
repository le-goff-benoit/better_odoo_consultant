from backend.services.provider_adapters import (
    get_provider_adapter,
    provider_capabilities,
)
from backend.services.skill_runtime import SkillRuntimeEvent


def test_provider_adapters_expose_backend_emulated_capabilities():
    expected_formats = {
        "claude": "claude",
        "openai": "openai",
        "gemini": "gemini",
        "github": "openai",
        "copilot": "openai",
    }

    for provider, tool_format in expected_formats.items():
        adapter = get_provider_adapter(provider)
        assert adapter is not None
        assert adapter.execution_mode == "backend_emulated"
        assert adapter.tool_format == tool_format
        assert adapter.capabilities.tool_calling is True
        assert adapter.capabilities.native_skills is False


def test_provider_adapters_format_system_by_provider_family():
    claude = get_provider_adapter("claude")
    openai = get_provider_adapter("openai")
    github = get_provider_adapter("github")
    gemini = get_provider_adapter("gemini")

    assert claude is not None
    assert claude.format_system("stable", "variable") == ("stable", "variable")
    assert openai is not None
    assert openai.format_system("stable", "variable") == "stable\n\nvariable"
    assert github is not None
    assert github.tool_format == "openai"
    assert github.format_system("stable", "variable") == "stable\n\nvariable"
    assert gemini is not None
    assert gemini.format_system("stable", "variable") == "stable\n\nvariable"


def test_provider_adapter_stream_delegates_to_registered_provider():
    github = get_provider_adapter("github")

    def github_streamer(*args, **kwargs):
        return {"provider": "github", "args": args}

    assert github is not None
    assert github.stream({"github": github_streamer}, "payload") == {
        "provider": "github",
        "args": ("payload",),
    }


def test_unknown_provider_has_no_capabilities():
    assert get_provider_adapter("unknown") is None
    assert provider_capabilities("unknown") is None


def test_runtime_event_serializes_only_present_fields():
    event = SkillRuntimeEvent(
        type="execution_done",
        provider="openai",
        model="gpt-4o",
        duration_ms=12,
        ok=True,
        input_tokens=100,
    )

    assert event.to_dict() == {
        "type": "execution_done",
        "provider": "openai",
        "model": "gpt-4o",
        "execution_mode": "backend_emulated",
        "duration_ms": 12,
        "ok": True,
        "input_tokens": 100,
    }
