from odoo_consultant_portal.services.ai_service import (
    TOOLS_CLAUDE,
    TOOLS_GEMINI,
    TOOLS_OPENAI,
    _run_tool,
)


class FakeOdoo:
    def __init__(self, total: int):
        self.total = total
        self.calls: list[dict] = []

    def search_count(self, model, domain=None):
        return self.total

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        self.calls.append({"limit": limit, "offset": offset})
        end = min(offset + limit, self.total)
        return [{"id": idx} for idx in range(offset, end)]


async def test_query_odoo_fetches_1018_records_without_silent_truncation():
    fake = FakeOdoo(total=1018)

    result = await _run_tool("query_odoo", {
        "model": "sale.order.line",
        "fields": ["id"],
    }, fake)

    assert result["ok"] is True
    assert result["count"] == 1018
    assert result["total_count"] == 1018
    assert result["pages_fetched"] == 3
    assert result["truncated"] is False
    assert result["warning"] is None
    assert fake.calls == [
        {"limit": 500, "offset": 0},
        {"limit": 500, "offset": 500},
        {"limit": 18, "offset": 1000},
    ]


async def test_query_odoo_caps_default_exhaustive_fetch_with_warning():
    fake = FakeOdoo(total=6000)

    result = await _run_tool("query_odoo", {
        "model": "sale.order.line",
        "fields": ["id"],
    }, fake)

    assert result["count"] == 5000
    assert result["total_count"] == 6000
    assert result["pages_fetched"] == 10
    assert result["truncated"] is True
    assert "borné" in result["warning"]


async def test_query_odoo_respects_explicit_limit_and_warns():
    fake = FakeOdoo(total=1018)

    result = await _run_tool("query_odoo", {
        "model": "sale.order.line",
        "fields": ["id"],
        "limit": 100,
    }, fake)

    assert result["count"] == 100
    assert result["total_count"] == 1018
    assert result["truncated"] is True
    assert "limit=100" in result["warning"]
    assert fake.calls == [{"limit": 100, "offset": 0}]


def test_query_odoo_schemas_describe_exhaustive_bounded_defaults():
    claude = next(t for t in TOOLS_CLAUDE if t["name"] == "query_odoo")
    c_props = claude["input_schema"]["properties"]
    assert c_props["limit"]["default"] == 0
    assert c_props["page_size"]["default"] == 500
    assert c_props["max_records"]["default"] == 5000

    openai = next(t for t in TOOLS_OPENAI if t["function"]["name"] == "query_odoo")
    o_props = openai["function"]["parameters"]["properties"]
    assert o_props["limit"]["default"] == 0
    assert o_props["page_size"]["default"] == 500
    assert o_props["max_records"]["default"] == 5000

    gemini = next(
        fd
        for fd in TOOLS_GEMINI[0]["function_declarations"]
        if fd["name"] == "query_odoo"
    )
    g_props = gemini["parameters"]["properties"]
    assert "page_size" in g_props
    assert "max_records" in g_props
