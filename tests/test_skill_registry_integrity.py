from pathlib import Path

from odoo_consultant_portal.services.context_service import read_file
from odoo_consultant_portal.skills.registry import (
    SKILL_DEFINITIONS,
    read_skill_reference,
    resolve_skill_script,
)


def test_every_skill_folder_is_loaded_and_legacy_context_is_available():
    skills_dir = Path("odoo_consultant_portal/skills")
    folders = sorted(p.name for p in skills_dir.iterdir() if (p / "SKILL.md").is_file())
    loaded = {skill.folder and Path(skill.folder).name: skill for skill in SKILL_DEFINITIONS}

    assert set(folders) <= set(loaded.keys())
    for folder in folders:
        skill = loaded[folder]
        assert skill.body.strip()
        content = read_file(skill.context_file, "fr")
        assert skill.name in content


def test_skill_references_and_scripts_declared_by_registry_are_resolvable():
    for skill in SKILL_DEFINITIONS:
        for ref in skill.references:
            content = read_skill_reference(skill.name, ref)
            assert content and content.strip()
        for script in skill.scripts:
            if skill.permissions.scripts:
                assert resolve_skill_script(skill.name, script) is not None
