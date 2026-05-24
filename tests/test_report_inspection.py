import pytest

from backend.services.view_service import inspect_odoo_report


class FakeLargeReportOdoo:
    company_id = None

    def __init__(self, arch: str):
        self.arch = arch

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        if model == "ir.actions.report":
            return [{
                "id": 1,
                "name": "Facture",
                "report_name": "account.report_invoice",
                "model": "account.move",
                "report_type": "qweb-pdf",
                "paperformat_id": [3, "A4"],
            }]
        if model == "ir.ui.view":
            if any(term[:2] == ["inherit_id", "="] for term in (domain or [])):
                return []
            if fields == ["arch"]:
                return [{"arch": self.arch}]
            return [{"id": 5, "name": "Invoice", "key": "account.report_invoice"}]
        if model == "report.paperformat":
            return [{"name": "A4", "format": "A4", "orientation": "Portrait", "dpi": 90}]
        if model == "res.company":
            return [{"name": "Acme", "external_report_layout_id": [2, "Boxed"], "font": "Lato"}]
        return []


@pytest.mark.asyncio
async def test_inspect_odoo_report_keeps_document_arch_beyond_old_8k_cap():
    arch = (
        '<t t-name="account.report_invoice">'
        f"<div>{'x' * 9000}</div>"
        '<table><thead><tr><th>Total</th></tr></thead>'
        '<tbody><tr><td><span t-field="o.amount_total"/></td></tr></tbody></table>'
        "</t>"
    )

    result = await inspect_odoo_report(FakeLargeReportOdoo(arch), report_name="account.report_invoice")

    returned_arch = result["qweb_archs"]["account.report_invoice"]
    assert "arch tronquée" not in returned_arch
    assert 't-field="o.amount_total"' in returned_arch
    assert result["qweb_arch_meta"]["account.report_invoice"]["truncated"] is False
    summary = result["qweb_summaries"]["account.report_invoice"]
    assert summary["field_refs"] == [{"tag": "span", "expr": "o.amount_total", "class": None}]
    assert summary["tables"][0]["headers"] == ["Total"]


@pytest.mark.asyncio
async def test_inspect_odoo_report_summarizes_full_arch_when_raw_xml_is_bounded():
    arch = (
        '<t t-name="account.report_invoice">'
        f"<div>{'x' * 55000}</div>"
        '<table><thead><tr><th>Total TTC</th></tr></thead>'
        '<tbody><tr><td><span t-field="o.amount_total"/></td></tr></tbody></table>'
        "</t>"
    )

    result = await inspect_odoo_report(FakeLargeReportOdoo(arch), report_name="account.report_invoice")

    meta = result["qweb_arch_meta"]["account.report_invoice"]
    assert meta["truncated"] is True
    assert "arch tronquée" in result["qweb_archs"]["account.report_invoice"]
    summary = result["qweb_summaries"]["account.report_invoice"]
    assert {"tag": "span", "expr": "o.amount_total", "class": None} in summary["field_refs"]
    assert summary["tables"][0]["headers"] == ["Total TTC"]
    assert summary["summary_truncated"] is False
