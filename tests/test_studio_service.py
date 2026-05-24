import pytest

from backend.services.studio_service import inspect_studio_customizations


class FakeLargeStudioOdoo:
    def __init__(self, view_count: int):
        self.view_count = view_count
        self.calls: list[dict] = []

    def search_count(self, model, domain=None):
        return len(self._rows(model, domain or []))

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        self.calls.append({"model": model, "limit": limit, "offset": offset})
        rows = self._rows(model, domain or [])
        if limit and limit > 0:
            rows = rows[offset:offset + limit]
        else:
            rows = rows[offset:]
        return rows

    def _rows(self, model, domain):
        if model == "ir.model.data":
            model_filter = next((term[2] for term in domain if term[:2] == ["model", "="]), "")
            if model_filter == "ir.ui.view":
                return [{"id": idx, "res_id": idx} for idx in range(1, self.view_count + 1)]
            return []
        if model == "ir.ui.view":
            ids = set()
            for term in domain:
                if term[:2] == ["id", "in"]:
                    ids = set(term[2])
            return [
                {
                    "id": idx,
                    "name": f"Studio PDF report {idx}",
                    "model": "sale.order",
                    "type": "qweb" if idx % 2 == 0 else "form",
                    "key": f"studio_customization.report_{idx}",
                    "priority": 16,
                    "active": True,
                }
                for idx in range(1, self.view_count + 1)
                if not ids or idx in ids
            ]
        return []


@pytest.mark.asyncio
async def test_odoo_inspect_studio_views_are_paginated_without_false_truncation():
    fake = FakeLargeStudioOdoo(view_count=1018)

    result = await inspect_studio_customizations(fake, sections=["views"])

    views = result["studio_views"]
    assert views["count"] == 1018
    assert views["total_count"] == 1018
    assert views["pages_fetched"] == 3
    assert views["truncated"] is False
    assert views["warning"] is None
    assert len(views["items"]) == 1018
    assert [c for c in fake.calls if c["model"] == "ir.ui.view"] == [
        {"model": "ir.ui.view", "limit": 500, "offset": 0},
        {"model": "ir.ui.view", "limit": 500, "offset": 500},
        {"model": "ir.ui.view", "limit": 18, "offset": 1000},
    ]


@pytest.mark.asyncio
async def test_odoo_inspect_studio_views_warns_when_section_hits_bounded_cap():
    fake = FakeLargeStudioOdoo(view_count=6000)

    result = await inspect_studio_customizations(fake, sections=["views"])

    views = result["studio_views"]
    assert views["count"] == 5000
    assert views["total_count"] == 6000
    assert views["truncated"] is True
    assert "identifiants XML" in views["warning"]
