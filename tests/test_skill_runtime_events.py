import pytest

from backend.services import ai_service
from backend.services.skill_runtime import (
    drain_runtime_events,
    reset_runtime_event_buffer,
    start_runtime_event_buffer,
)


@pytest.mark.asyncio
async def test_meta_tools_collect_reference_and_script_runtime_events():
    token = start_runtime_event_buffer()
    try:
        ref_result = await ai_service._run_tool(
            "load_skill_reference",
            {"skill": "odoo_inspect_studio", "filename": "studio_limits.md"},
            None,
        )
        ref_events = [event.to_dict() for event in drain_runtime_events()]

        assert ref_result["ok"] is True
        assert any(
            event["type"] == "policy_decision"
            and event["action"] == "load_reference"
            and event["denied"] is False
            for event in ref_events
        )
        assert any(
            event["type"] == "reference_loaded"
            and event["skill"] == "odoo_inspect_studio"
            and event["filename"] == "studio_limits.md"
            for event in ref_events
        )

        script_result = await ai_service._run_tool(
            "run_skill_script",
            {"skill": "odoo_query_records", "filename": "explain_domain.py", "args": ["[]"]},
            None,
        )
        script_events = [event.to_dict() for event in drain_runtime_events()]

        assert script_result["ok"] is True
        assert any(
            event["type"] == "policy_decision"
            and event["action"] == "run_script"
            and event["denied"] is False
            for event in script_events
        )
        assert any(
            event["type"] == "script_executed"
            and event["skill"] == "odoo_query_records"
            and event["filename"] == "explain_domain.py"
            and event["ok"] is True
            for event in script_events
        )
    finally:
        reset_runtime_event_buffer(token)


@pytest.mark.asyncio
async def test_denied_script_runtime_event_is_collected():
    token = start_runtime_event_buffer()
    try:
        result = await ai_service._run_tool(
            "run_skill_script",
            {"skill": "repo_read_file", "filename": "handler.py", "args": []},
            None,
        )
        events = [event.to_dict() for event in drain_runtime_events()]

        assert result["ok"] is False
        assert any(
            event["type"] == "policy_decision"
            and event["skill"] == "repo_read_file"
            and event["denied"] is True
            and event["permission"] == "scripts"
            for event in events
        )
    finally:
        reset_runtime_event_buffer(token)


@pytest.mark.asyncio
async def test_stream_chat_emits_runtime_events_for_provider_and_done(monkeypatch):
    async def fake_chat(*args, **kwargs):
        yield {"type": "done", "model": "fake-model", "input_tokens": 2, "output_tokens": 3}

    monkeypatch.setattr(ai_service, "_chat_openai", fake_chat)

    events = [
        evt async for evt in ai_service.stream_chat(
            "openai",
            "fake-key",
            "fake-model",
            None,
            None,
            [{"role": "user", "content": "Hello"}],
            source_path="/tmp/source",
            context_md="",
            version="18.0",
            run_id="run-stream-1",
        )
    ]

    runtime_events = [evt["event"] for evt in events if evt.get("type") == "runtime_event"]
    done = next(evt for evt in events if evt.get("type") == "done")

    assert any(event["type"] == "provider_called" and event["provider"] == "openai" for event in runtime_events)
    assert any(event["type"] == "execution_done" and event["provider"] == "openai" for event in runtime_events)
    assert all(event["run_id"] == "run-stream-1" for event in runtime_events)
    assert done["execution_mode"] == "backend_emulated"

    # Token usage emitted by the provider must reach the execution_done event
    # so observability can compute ratios (context tokens vs output tokens)
    # without re-parsing provider-specific response payloads.
    execution_done = next(event for event in runtime_events if event["type"] == "execution_done")
    assert execution_done.get("input_tokens") == 2
    assert execution_done.get("output_tokens") == 3
