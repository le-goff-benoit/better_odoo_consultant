from backend.services import ai_service
from backend.services.provider_adapters import get_provider_adapter
from backend.services.toolset_builder import build_provider_toolsets


def _inputs(base):
    return ai_service._toolset_inputs(*base)


def _names(toolsets):
    return set(toolsets.exposed_skills)


def test_general_source_only_toolset_excludes_live_odoo_tools():
    toolsets = build_provider_toolsets(
        _inputs((ai_service.TOOLS_CLAUDE_SRC, ai_service.TOOLS_OPENAI_SRC, ai_service.TOOLS_GEMINI_SRC)),
        source_available=True,
    )

    names = _names(toolsets)
    assert "source_search_odoo" in names
    assert "source_read_odoo_file" in names
    assert "odoo_inspect_studio" not in names
    assert "odoo_query_records" not in names


def test_repo_and_target_tools_are_added_when_paths_are_available():
    toolsets = build_provider_toolsets(
        _inputs((ai_service.TOOLS_CLAUDE_SRC, ai_service.TOOLS_OPENAI_SRC, ai_service.TOOLS_GEMINI_SRC)),
        source_available=True,
        repo_available=True,
        target_available=True,
    )

    names = _names(toolsets)
    assert "repo_read_file" in names
    assert "repo_search_code" in names
    assert "migration_search_target_source" in names
    assert "repo_count_source_lines" in names


def test_disabled_tools_are_filtered_for_all_provider_formats():
    toolsets = build_provider_toolsets(
        _inputs((ai_service.TOOLS_CLAUDE, ai_service.TOOLS_OPENAI, ai_service.TOOLS_GEMINI)),
        live_odoo_available=True,
        disabled_tools=["odoo_inspect_studio", "odoo_query_records"],
    )

    assert "odoo_inspect_studio" not in _names(toolsets)
    assert "odoo_query_records" not in _names(toolsets)
    assert all(tool.get("name") != "odoo_query_records" for tool in toolsets.claude)
    assert all((tool.get("function") or {}).get("name") != "odoo_query_records" for tool in toolsets.openai)
    assert all(
        fd.get("name") != "odoo_query_records"
        for fd in toolsets.gemini[0].get("function_declarations", [])
    )


def test_disabled_legacy_aliases_filter_canonical_tools():
    toolsets = build_provider_toolsets(
        _inputs((ai_service.TOOLS_CLAUDE, ai_service.TOOLS_OPENAI, ai_service.TOOLS_GEMINI)),
        live_odoo_available=True,
        disabled_tools=["inspect_studio", "query_odoo"],
    )

    assert "odoo_inspect_studio" not in _names(toolsets)
    assert "odoo_query_records" not in _names(toolsets)


def test_provider_adapter_selects_matching_toolset_format():
    toolsets = build_provider_toolsets(
        _inputs((ai_service.TOOLS_CLAUDE, ai_service.TOOLS_OPENAI, ai_service.TOOLS_GEMINI)),
        live_odoo_available=True,
    )

    assert get_provider_adapter("claude").select_toolset(toolsets) is toolsets.claude
    assert get_provider_adapter("openai").select_toolset(toolsets) is toolsets.openai
    assert get_provider_adapter("github").select_toolset(toolsets) is toolsets.openai
    assert get_provider_adapter("gemini").select_toolset(toolsets) is toolsets.gemini
