"""Structured observability events for the backend skill runtime."""

from __future__ import annotations

import logging
import time
from contextvars import ContextVar
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Optional

RuntimeEventType = Literal[
    "provider_called",
    "policy_decision",
    "reference_loaded",
    "script_executed",
    "execution_done",
]


@dataclass(frozen=True)
class SkillRuntimeEvent:
    type: RuntimeEventType
    run_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    execution_mode: str = "backend_emulated"
    skill: Optional[str] = None
    filename: Optional[str] = None
    duration_ms: Optional[int] = None
    ok: Optional[bool] = None
    denied: Optional[bool] = None
    reason: Optional[str] = None
    permission: Optional[str] = None
    action: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        return {key: value for key, value in data.items() if value not in (None, {}, [])}


def monotonic_ms() -> int:
    return int(time.monotonic() * 1000)


_RUNTIME_EVENTS: ContextVar[list[SkillRuntimeEvent] | None] = ContextVar(
    "skill_runtime_events",
    default=None,
)
_RUNTIME_RUN_ID: ContextVar[str | None] = ContextVar(
    "skill_runtime_run_id",
    default=None,
)


def start_runtime_event_buffer(run_id: Optional[str] = None):
    """Start collecting runtime events for the current async task."""
    events_token = _RUNTIME_EVENTS.set([])
    run_id_token = _RUNTIME_RUN_ID.set(run_id)
    return events_token, run_id_token


def reset_runtime_event_buffer(token) -> None:
    if isinstance(token, tuple) and len(token) == 2:
        events_token, run_id_token = token
        _RUNTIME_EVENTS.reset(events_token)
        _RUNTIME_RUN_ID.reset(run_id_token)
        return
    _RUNTIME_EVENTS.reset(token)


def drain_runtime_events() -> list[SkillRuntimeEvent]:
    """Return and clear events collected since the last drain."""
    events = _RUNTIME_EVENTS.get()
    if not events:
        return []
    drained = list(events)
    events.clear()
    return drained


def log_runtime_event(logger: logging.Logger, event: SkillRuntimeEvent) -> None:
    run_id = _RUNTIME_RUN_ID.get()
    if run_id and event.run_id is None:
        event = SkillRuntimeEvent(**{**asdict(event), "run_id": run_id})
    events = _RUNTIME_EVENTS.get()
    if events is not None:
        events.append(event)
    logger.info("skill_runtime_event %s", event.to_dict())
