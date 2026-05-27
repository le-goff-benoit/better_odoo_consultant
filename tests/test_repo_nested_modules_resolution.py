"""v0.100.7 — resolve module paths when modules are nested in submodules.

Bug context: a client repo organises its modules in nested directories
(typically `submodules/oca-server-tools/auditlog/...`). The LLM sees the
module name `auditlog` from `ir.module.module` listing and asks
`repo_read_file path=auditlog/models/foo.py`. The literal path does not
exist at repo root → file-not-found error → the agent can't read the
module that IS installed.

Fix: when the literal join misses, walk the repo to locate
`<module>/__manifest__.py` and rewrite the request accordingly.
"""
from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path

import pytest

from backend.skills._shared.source_search import (
    _MODULE_LOCATION_CACHE,
    _locate_module_in_repo,
    read_file,
    safe_source_path,
    source_search_dirs,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    _MODULE_LOCATION_CACHE.clear()
    yield
    _MODULE_LOCATION_CACHE.clear()


def _make_nested_repo(root: Path) -> None:
    """Create a repo with: top-level client_module + nested oca modules."""
    (root / "client_module").mkdir(parents=True)
    (root / "client_module" / "__manifest__.py").write_text("{'name': 'client_module'}", encoding="utf-8")
    (root / "client_module" / "models").mkdir()
    (root / "client_module" / "models" / "main.py").write_text("# top-level module\nclass A: pass\n", encoding="utf-8")

    nested = root / "submodules" / "oca-server-tools" / "auditlog"
    nested.mkdir(parents=True)
    (nested / "__manifest__.py").write_text("{'name': 'auditlog', 'author': 'OCA'}", encoding="utf-8")
    (nested / "models").mkdir()
    (nested / "models" / "rule.py").write_text("# nested via submodule\nclass Rule: pass\n", encoding="utf-8")


def test_locate_module_finds_top_level(tmp_path):
    _make_nested_repo(tmp_path)
    parent = _locate_module_in_repo(str(tmp_path), "client_module")
    assert parent == "", "top-level module's parent is the repo root"


def test_locate_module_finds_nested(tmp_path):
    _make_nested_repo(tmp_path)
    parent = _locate_module_in_repo(str(tmp_path), "auditlog")
    assert parent and parent.endswith(os.path.join("submodules", "oca-server-tools"))


def test_locate_module_returns_none_for_unknown(tmp_path):
    _make_nested_repo(tmp_path)
    assert _locate_module_in_repo(str(tmp_path), "does_not_exist") is None


def test_safe_source_path_resolves_nested_module_path(tmp_path):
    _make_nested_repo(tmp_path)
    # LLM asks for the module file by short name — must resolve to nested location.
    resolved = safe_source_path(str(tmp_path), "auditlog/models/rule.py", include_enterprise=False)
    assert resolved is not None
    assert resolved.endswith(os.path.join("submodules", "oca-server-tools", "auditlog", "models", "rule.py"))


def test_safe_source_path_top_level_still_works(tmp_path):
    _make_nested_repo(tmp_path)
    resolved = safe_source_path(str(tmp_path), "client_module/models/main.py", include_enterprise=False)
    assert resolved is not None
    assert resolved.endswith(os.path.join("client_module", "models", "main.py"))


def test_search_dirs_resolves_nested_module(tmp_path):
    _make_nested_repo(tmp_path)
    dirs = source_search_dirs(str(tmp_path), "auditlog", include_enterprise=False)
    assert dirs, "search should resolve the nested module dir for grep"
    assert dirs[0].endswith(os.path.join("submodules", "oca-server-tools", "auditlog"))


def test_read_file_works_on_nested_module(tmp_path):
    _make_nested_repo(tmp_path)
    result = asyncio.run(read_file({"path": "auditlog/models/rule.py"}, str(tmp_path), include_enterprise=False))
    assert result["ok"] is True, result
    assert "class Rule" in result["content"]


def test_read_file_returns_clean_error_for_unknown_module(tmp_path):
    _make_nested_repo(tmp_path)
    result = asyncio.run(read_file({"path": "no_such_module/models/x.py"}, str(tmp_path), include_enterprise=False))
    assert result["ok"] is False
    assert "introuvable" in result["error"].lower()


def test_safe_source_path_rejects_traversal(tmp_path):
    _make_nested_repo(tmp_path)
    # Even with the fallback, the safe_join guard must still reject escape.
    resolved = safe_source_path(str(tmp_path), "../outside.py", include_enterprise=False)
    # Either returns None or stays inside the repo. It must not point outside.
    if resolved is not None:
        assert os.path.realpath(resolved).startswith(os.path.realpath(str(tmp_path)))
