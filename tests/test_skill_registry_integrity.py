from pathlib import Path

from backend.skills.registry import (
    SKILL_DEFINITIONS,
    canonical_skill_name,
    read_skill_reference,
    resolve_skill_script,
    skill_registry_diagnostics,
    skill_aliases,
    skill_by_name,
)
from backend.skills.manifest import parse_skill_manifest


def test_every_skill_folder_is_loaded_with_body():
    skills_dir = Path("skills")
    folders = sorted(p.name for p in skills_dir.iterdir() if (p / "SKILL.md").is_file())
    loaded = {skill.folder and Path(skill.folder).name: skill for skill in SKILL_DEFINITIONS}

    assert set(folders) <= set(loaded.keys())
    for folder in folders:
        skill = loaded[folder]
        assert skill.body.strip()


def test_skill_references_and_scripts_declared_by_registry_are_resolvable():
    for skill in SKILL_DEFINITIONS:
        for ref in skill.references:
            content = read_skill_reference(skill.name, ref)
            assert content and content.strip()
        for script in skill.scripts:
            if skill.permissions.scripts:
                assert resolve_skill_script(skill.name, script) is not None


def test_manifest_requires_minimal_skill_contract():
    parsed = parse_skill_manifest("---\nname: bad-skill\n---\n# Missing description\n")

    assert not parsed.valid
    assert "missing required field: description" in parsed.errors
    assert any("snake_case" in error for error in parsed.errors)


def test_manifest_merges_x_app_without_overriding_root_fields():
    parsed = parse_skill_manifest(
        "---\n"
        "name: demo_skill\n"
        "description: Demo skill for manifest parsing.\n"
        "version: 1.0.0\n"
        "permissions:\n"
        "  filesystem: invalid\n"
        "x-app:\n"
        "  version: 2.0.0\n"
        "  tags: [pilot]\n"
        "  permissions:\n"
        "    scripts: true\n"
        "---\n"
        "# Demo\n\nFollow the workflow.\n"
    )

    assert parsed.valid
    assert parsed.meta["version"] == "1.0.0"
    assert parsed.meta["tags"] == ["pilot"]
    assert parsed.meta["permissions"] == {
        "filesystem": "none",
        "network": False,
        "scripts": False,
        "odoo": "none",
    }


def test_renamed_skills_keep_legacy_aliases():
    aliases = skill_aliases()

    assert aliases["query_odoo"] == "odoo_query_records"
    assert aliases["inspect_studio"] == "odoo_inspect_studio"
    assert aliases["read_project_file"] == "repo_read_file"
    assert aliases["report_writer"] == "output_report_writer"
    assert canonical_skill_name("query_odoo") == "odoo_query_records"
    assert skill_by_name("query_odoo") == skill_by_name("odoo_query_records")


def test_skill_registry_diagnostics_have_no_p0_errors():
    diagnostics = skill_registry_diagnostics()

    assert all(item["severity"] != "error" for item in diagnostics), diagnostics
    assert not any(item["code"] == "missing_code_path" for item in diagnostics), diagnostics


def test_skill_registry_load_budget():
    """Guardrail: every SKILL.md is loaded into memory at startup. We accept
    this for the current ~30-skill catalog, but past a soft cap we want to
    revisit progressive loading rather than silently grow the cold-start cost.

    Bump the cap deliberately when adding skills, after confirming startup
    latency and prompt-time injection are still acceptable.
    """
    soft_cap = 60
    hard_cap = 100
    count = len(SKILL_DEFINITIONS)
    assert count < hard_cap, (
        f"{count} skills registered — hard cap {hard_cap} exceeded. "
        "Revisit progressive loading before adding more."
    )
    if count >= soft_cap:
        # Surfaced as a test message rather than a failure so the team sees it
        # in CI output but keeps shipping.
        import warnings
        warnings.warn(
            f"{count} skills registered — approaching hard cap {hard_cap}. "
            "Consider lazy SKILL.md loading.",
            stacklevel=2,
        )
