"""Regression v0.99.4 — defensive model-id validation in stream_chat.

Even after `gpt-5.5` was removed from the static frontend catalogue in
v0.99.1, user browsers running cached bundles kept POSTing that id to the
chat endpoint, causing `400 unsupported_api_for_model` from OpenAI.
This test pins the new server-side allowlist behaviour : stale ids fall
back to the provider default with a clear reason string.
"""
from backend.services.ai_service import (
    DEFAULT_MODELS,
    KNOWN_MODELS,
    _validate_or_fallback_model,
)


def test_validate_accepts_known_openai_model():
    model, reason = _validate_or_fallback_model("openai", "gpt-4o")
    assert model == "gpt-4o"
    assert reason is None


def test_validate_falls_back_on_hallucinated_openai_model():
    model, reason = _validate_or_fallback_model("openai", "gpt-5.5")
    assert model == DEFAULT_MODELS["openai"]
    assert reason is not None
    assert "gpt-5.5" in reason
    assert "périmé" in reason.lower() or "cache" in reason.lower()


def test_validate_uses_default_on_empty_model_id():
    model, reason = _validate_or_fallback_model("openai", "")
    assert model == DEFAULT_MODELS["openai"]
    assert reason is None  # Empty is normal, not a stale-id signal


def test_validate_allows_anything_for_github_and_copilot():
    # Live catalog providers — backend has no static allowlist to compare
    # against, so we let the request through. The provider API will reject
    # invalid ids on its own (and the frontend live-fetch keeps the static
    # fallback minimal).
    model, reason = _validate_or_fallback_model("github", "some-future-id-2027")
    assert model == "some-future-id-2027"
    assert reason is None

    model, reason = _validate_or_fallback_model("copilot", "another-id")
    assert model == "another-id"
    assert reason is None


def test_validate_falls_back_on_unknown_claude_model():
    model, reason = _validate_or_fallback_model("claude", "claude-5-doesnt-exist")
    assert model == DEFAULT_MODELS["claude"]
    assert reason is not None


def test_validate_falls_back_on_deprecated_gemini_model():
    # gemini-1.5-pro was sunset by Google early 2026 → removed from catalog
    model, reason = _validate_or_fallback_model("gemini", "gemini-1.5-pro")
    assert model == DEFAULT_MODELS["gemini"]
    assert reason is not None
    assert "gemini-1.5-pro" in reason


def test_known_models_stays_in_sync_with_default_models():
    """Each provider with an allowlist must have its DEFAULT_MODELS entry
    present in the allowlist — otherwise we'd fall back to an id we
    just rejected."""
    for provider, allowed in KNOWN_MODELS.items():
        default = DEFAULT_MODELS.get(provider)
        assert default in allowed, (
            f"DEFAULT_MODELS[{provider!r}] = {default!r} but it's not in "
            f"KNOWN_MODELS[{provider!r}] = {sorted(allowed)}. "
            "These two constants must stay synchronised."
        )
