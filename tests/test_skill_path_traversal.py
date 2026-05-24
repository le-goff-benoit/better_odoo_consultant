"""Defensive tests for skill file resolution.

The skill loader is the only path through which untrusted tool args reach the
filesystem (LLM-generated ``skill``/``filename`` arguments to
``load_skill_reference`` and ``run_skill_script``). These tests pin down the
rejection contract: anything that escapes the skill folder, uses an unexpected
extension, or matches a suspicious shape must be refused before any I/O.
"""

from pathlib import Path

import pytest

from backend.services.skill_loader import DEFAULT_SKILL_LOADER, SkillLoader
from backend.skills.registry import skill_by_name


_VICTIM_SKILL = "odoo_inspect_studio"  # has a real references/ folder


@pytest.fixture
def loader() -> SkillLoader:
    return DEFAULT_SKILL_LOADER


@pytest.mark.parametrize(
    "filename",
    [
        "../../../etc/passwd",
        "../../README.md",
        "..%2F..%2Fsecret.md",
        "subdir/inner.md",
        "..\\..\\windows.md",
        "/etc/passwd",
        "studio_limits.md\x00.txt",   # NUL injection
        "studio_limits.md ",           # trailing space
        ".studio_limits.md",           # leading dot
        "studio_limits.MD",            # uppercase extension (regex requires lowercase)
        "",
        ".",
        "..",
    ],
)
def test_load_reference_rejects_suspicious_filenames(loader: SkillLoader, filename: str):
    result = loader.load_reference(_VICTIM_SKILL, filename, enforce_policy=False)
    assert result.ok is False, f"reference loader must refuse {filename!r}"
    assert result.content is None
    assert result.path is None


@pytest.mark.parametrize(
    "filename",
    [
        "../../../etc/passwd",
        "../handler.py",
        "subdir/inner.py",
        "/usr/bin/python3",
        "handler.py\x00",
    ],
)
def test_resolve_script_rejects_suspicious_filenames(loader: SkillLoader, filename: str):
    # Use a skill that declares scripts=true to bypass the policy block and
    # exercise the path-resolution layer specifically.
    result = loader.resolve_script("odoo_query_records", filename)
    assert result.ok is False, f"script loader must refuse {filename!r}"
    assert result.path is None


def test_load_reference_rejects_unknown_skill(loader: SkillLoader):
    result = loader.load_reference("../etc", "passwd.md", enforce_policy=False)
    assert result.ok is False
    assert result.path is None


def test_resolved_path_stays_inside_skill_folder(loader: SkillLoader):
    """For a valid load, the resolved path must be strictly under the skill folder."""
    skill = skill_by_name(_VICTIM_SKILL)
    assert skill is not None and skill.folder, "fixture skill not registered"
    # Pick the first real reference file declared by the skill.
    assert skill.references, "fixture skill must declare at least one reference"
    ref_name = skill.references[0]

    result = loader.load_reference(_VICTIM_SKILL, ref_name, enforce_policy=False)
    assert result.ok is True
    assert result.path is not None

    base = Path(skill.folder).resolve() / "references"
    resolved = result.path.resolve()
    # ``relative_to`` raises if resolved is not under base — that is the contract.
    resolved.relative_to(base)


def test_symlink_escape_is_refused(tmp_path: Path, loader: SkillLoader):
    """A symlink inside references/ that points outside the skill folder must
    be refused by the resolver (relative_to check fires after .resolve())."""
    skill = skill_by_name(_VICTIM_SKILL)
    assert skill is not None and skill.folder
    refs = Path(skill.folder) / "references"

    # Create a temporary file outside the skill folder, then a symlink inside
    # references/ that points at it. The resolver must follow the symlink and
    # reject the escape.
    outside = tmp_path / "outside.md"
    outside.write_text("leaked", encoding="utf-8")
    link = refs / "escape_link.md"
    if link.exists() or link.is_symlink():
        link.unlink()
    link.symlink_to(outside)
    try:
        result = loader.load_reference(_VICTIM_SKILL, "escape_link.md", enforce_policy=False)
        assert result.ok is False, "symlink escape must be refused"
        assert result.content != "leaked"
    finally:
        if link.exists() or link.is_symlink():
            link.unlink()
