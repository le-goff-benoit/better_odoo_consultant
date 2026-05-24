from backend.services.skill_loader import DEFAULT_SKILL_LOADER
from backend.skills.registry import read_skill_reference, read_skill_template


def test_skill_loader_reads_reference_template_and_example():
    ref = DEFAULT_SKILL_LOADER.load_reference("odoo_inspect_studio", "studio_limits.md")
    template = DEFAULT_SKILL_LOADER.load_template("output_report_writer", "technical_review")
    example = DEFAULT_SKILL_LOADER.load_example("repo_read_file", "good_usage.md", enforce_policy=False)

    assert ref.ok is True
    assert "Studio" in ref.content
    assert template.ok is True
    assert "Revue" in template.content or "Review" in template.content
    assert example.ok is True
    assert "Prompt utilisateur" in example.content


def test_skill_loader_refuses_traversal_subdirs_and_wrong_extension():
    traversal = DEFAULT_SKILL_LOADER.load_reference("odoo_inspect_studio", "../studio_limits.md")
    subdir = DEFAULT_SKILL_LOADER.load_reference("odoo_inspect_studio", "nested/studio_limits.md")
    wrong_ext = DEFAULT_SKILL_LOADER.resolve_script("odoo_query_records", "explain_domain.md")

    assert traversal.ok is False
    assert subdir.ok is False
    assert wrong_ext.ok is False


def test_skill_loader_allows_runtime_references_for_migrated_skills():
    loaded = DEFAULT_SKILL_LOADER.load_reference("odoo_inspect_fields", "field_types_guide.md")
    public_content = read_skill_reference("odoo_inspect_fields", "field_types_guide.md")

    assert loaded.ok is True
    assert loaded.decision is not None
    assert loaded.decision.denied is False
    assert public_content and "field" in public_content.lower()


def test_registry_template_wrapper_uses_skill_loader_compatibility():
    content = read_skill_template("output_report_writer", "technical_review")

    assert content and ("Revue" in content or "Review" in content)
