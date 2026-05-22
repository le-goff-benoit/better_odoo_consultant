"""Tool-result compression: record-bearing results keep a larger budget."""

from odoo_consultant_portal.services.ai_service import _compress_tool_result


def test_large_record_result_is_kept_whole():
    records = [{"id": i, "partner_id": [i, f"Fournisseur {i}"]} for i in range(200)]
    result = {"ok": True, "count": 200, "records": records}
    out = _compress_tool_result(result)
    # Well past the 2 000-char small cap, but kept because it carries records
    # the model needs to reason on (e.g. building a Creator changeset).
    assert len(out) > 2_000
    assert "tronqué" not in out


def test_large_non_record_result_is_truncated():
    result = {"ok": True, "matches": ["x" * 60 for _ in range(200)]}
    out = _compress_tool_result(result)
    assert "tronqué" in out
