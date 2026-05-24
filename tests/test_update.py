import pytest

from backend.api.routes import update


@pytest.mark.asyncio
async def test_update_status_detects_available_update(monkeypatch):
    values = {
        ("rev-parse", "--is-inside-work-tree"): "true",
        ("rev-parse", "HEAD"): "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ("fetch", "origin", "main"): "",
        ("rev-parse", "origin/main"): "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ("rev-list", "--count", "HEAD..origin/main"): "2",
        ("rev-list", "--count", "origin/main..HEAD"): "0",
        ("log", "-1", "--pretty=%s", "origin/main"): "New portal update",
    }

    def fake_git(args, timeout=30):
        return values[tuple(args)]

    monkeypatch.setattr(update, "_git", fake_git)

    result = await update.update_status()

    assert result["ok"]
    assert result["update_available"]
    assert result["local_short"] == "aaaaaaa"
    assert result["remote_short"] == "bbbbbbb"
    assert result["behind"] == 2
    assert result["latest_subject"] == "New portal update"