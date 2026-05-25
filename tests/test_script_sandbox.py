"""Garde-fou sandbox réseau : un skill déclarant ``network: false`` ne doit
pas être exécuté sans isolation réseau (``unshare -r -n``). Si le binaire
``unshare`` est absent, l'exécution doit être refusée avec un message clair
plutôt que de tomber en fail-open silencieux.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from backend.services import execution_engine


@dataclass(frozen=True)
class _FakePermissions:
    network: bool = False


@dataclass(frozen=True)
class _FakeSkill:
    name: str = "fake_skill"
    permissions: _FakePermissions = _FakePermissions()


@pytest.mark.asyncio
async def test_run_script_refused_when_unshare_missing(monkeypatch, tmp_path):
    script = tmp_path / "noop.py"
    script.write_text("print('hello')\n", encoding="utf-8")

    monkeypatch.setattr(execution_engine.shutil, "which", lambda _name: None)

    result = await execution_engine.run_skill_script_subprocess(script, [], _FakeSkill())

    assert result["ok"] is False
    assert result.get("sandbox_unavailable") is True
    assert "unshare" in result["error"].lower() or "sandbox" in result["error"].lower()


@pytest.mark.asyncio
async def test_run_script_proceeds_when_network_allowed(monkeypatch, tmp_path):
    """Quand le skill autorise network=True, l'absence d'unshare ne doit pas
    bloquer (la sandbox n'est plus requise)."""
    script = tmp_path / "noop.py"
    script.write_text("print('ok')\n", encoding="utf-8")

    monkeypatch.setattr(execution_engine.shutil, "which", lambda _name: None)

    skill = _FakeSkill(permissions=_FakePermissions(network=True))
    result = await execution_engine.run_skill_script_subprocess(script, [], skill)

    assert result["ok"] is True, result
    assert "ok" in result.get("stdout", "")
