"""v0.100.6 — vendored OCA/community submodules in client repo.

When a client deploys OCA modules via git submodules in their repo, the
detector used to silently drop them via `_manifest_is_custom`. The dev
profile would then land on "standard" and the context block would expose
zero modules, even with 50+ vendored modules in the working tree.

These tests reproduce that scenario and lock the new behaviour:
- vendored manifests are counted separately (`vendored_manifest_count`)
- vendored module names land in the context block
- dev_detected switches to True once >= VENDORED_DEV_THRESHOLD vendored
  modules are present in the repo
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from backend.services import technical_complexity_service as svc


def _write_manifest(module_dir: Path, author: str, name: str | None = None) -> None:
    module_dir.mkdir(parents=True, exist_ok=True)
    payload = {"name": name or module_dir.name, "author": author, "depends": ["base"]}
    (module_dir / "__manifest__.py").write_text(repr(payload), encoding="utf-8")


def test_repo_summary_separates_vendored_from_custom(tmp_path, monkeypatch):
    """Repo with a mix of custom-authored and OCA-vendored modules: both
    populations should be surfaced under separate keys."""
    profile = "acme"
    env_id = "prod"
    repo_root = tmp_path / ".odoo-consultant" / "repos" / profile / env_id
    (repo_root / ".git").mkdir(parents=True)
    _write_manifest(repo_root / "client_custom_module", author="Acme SA")
    _write_manifest(repo_root / "another_client_module", author="Acme SA")
    _write_manifest(repo_root / "oca_partner_firstname", author="Odoo Community Association (OCA)")
    _write_manifest(repo_root / "oca_web_responsive", author="Camptocamp, OCA")
    _write_manifest(repo_root / "oca_report_xlsx", author="OCA")

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    envs_json = json.dumps([{"id": env_id, "name": "Prod", "github_repo": "git@example.com:acme/odoo.git"}])
    repo = svc._repo_summary(profile, json.loads(envs_json))

    assert repo["manifest_count"] == 2, "only client-authored manifests count as custom"
    assert sorted(repo["repositories"][0]["custom_modules"]) == [
        "another_client_module",
        "client_custom_module",
    ]
    assert repo["vendored_manifest_count"] == 3, "OCA-authored manifests are vendored"
    assert set(repo["vendored_modules"]) >= {
        "oca_partner_firstname",
        "oca_web_responsive",
        "oca_report_xlsx",
    }


def test_repo_summary_with_only_vendored_still_surfaces_them(tmp_path, monkeypatch):
    """A client repo with ONLY OCA submodules (no client-authored code) used
    to detect zero dev — now we still surface the vendored layer."""
    profile = "acme"
    env_id = "prod"
    repo_root = tmp_path / ".odoo-consultant" / "repos" / profile / env_id
    (repo_root / ".git").mkdir(parents=True)
    for name in ("oca_a", "oca_b", "oca_c", "oca_d"):
        _write_manifest(repo_root / name, author="OCA")

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    envs = [{"id": env_id, "name": "Prod", "github_repo": "git@example.com:acme/odoo.git"}]
    repo = svc._repo_summary(profile, envs)

    assert repo["manifest_count"] == 0, "no client-authored manifests"
    assert repo["vendored_manifest_count"] == 4
    # The dev signal should still trigger via the vendored count even though
    # `manifest_count` is zero — the client OWNS deployment of these modules.
    assert repo["vendored_manifest_count"] >= svc.CUSTOM_MODULE_THRESHOLD * 3


def test_complexity_body_lists_vendored_modules(tmp_path):
    """The context block must mention vendored modules so the LLM sees them."""
    value = {
        "mode": "dev",
        "label": "Dev simple",
        "confidence": "high",
        "studio": {"detected": False, "inspected": True, "signal_count": 0},
        "dev": {
            "detected": True,
            "manifest_count": 0,
            "python_files": 0,
            "xml_files": 0,
            "vendored_manifest_count": 5,
            "vendored_modules": ["oca_a", "oca_b", "oca_c", "oca_d", "oca_e"],
            "repositories": [],
        },
        "installed_modules": {"available": True, "custom_module_count": 0, "community_module_count": 5, "community_modules": ["oca_a", "oca_b", "oca_c", "oca_d", "oca_e"]},
    }
    body = "\n".join(svc._build_complexity_body(value))
    assert "vendorés dans le repo client" in body
    assert "5" in body
    assert "oca_a" in body and "oca_b" in body


def test_vendored_modules_alone_trigger_dev_detection(tmp_path, monkeypatch):
    """End-to-end via `analyze_technical_complexity` with a repo that has
    only vendored modules and no Odoo connection: mode should not stay on
    'standard' — the vendored layer is a real dev signal."""
    profile = "acme"
    env_id = "prod"
    repo_root = tmp_path / ".odoo-consultant" / "repos" / profile / env_id
    (repo_root / ".git").mkdir(parents=True)
    for name in ("oca_a", "oca_b", "oca_c", "oca_d"):
        _write_manifest(repo_root / name, author="OCA")

    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    envs = json.dumps([{"id": env_id, "name": "Prod", "github_repo": "git@example.com:acme/odoo.git"}])

    import asyncio
    result = asyncio.run(svc.analyze_technical_complexity(profile, envs, odoo=None))
    assert result["mode"] in {"dev", "studio_dev"}, (
        f"expected dev mode from vendored layer alone, got {result['mode']}"
    )
    assert result["dev"]["detected"] is True
