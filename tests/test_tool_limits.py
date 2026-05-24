from pathlib import Path

from backend.skills._shared.project_modules import list_project_modules
from backend.skills._shared.source_search import read_file
from backend.services.ai_service import _run_tool


class FakeInstalledModulesOdoo:
    def __init__(self, total: int):
        self.total = total
        self.calls: list[dict] = []

    def search_count(self, model, domain=None):
        return self.total

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        self.calls.append({"model": model, "limit": limit, "offset": offset})
        end = min(offset + limit, self.total)
        return [
            {
                "id": idx,
                "name": f"module_{idx}",
                "shortdesc": f"Module {idx}",
                "author": "Odoo S.A.",
                "installed_version": "18.0.1.0.0",
                "application": idx % 20 == 0,
                "category_id": [1, "Tools"],
            }
            for idx in range(offset, end)
        ]


async def test_installed_modules_uses_bounded_pagination_without_silent_limit():
    fake = FakeInstalledModulesOdoo(total=1200)

    result = await _run_tool("odoo_inspect_modules", {}, fake)

    assert result["ok"] is True
    assert result["count"] == 1200
    assert result["total_count"] == 1200
    assert result["pages_fetched"] == 3
    assert result["truncated"] is False
    assert result["warning"] is None


async def test_read_group_default_is_not_artificially_limited():
    class FakeReadGroupOdoo:
        def read_group(self, model, domain=None, fields=None, groupby=None, limit=80, offset=0, orderby="", lazy=True):
            return [{"state": f"s{i}", "__count": 1} for i in range(120)]

    result = await _run_tool("odoo_aggregate_records", {
        "model": "sale.order",
        "fields": ["state"],
        "groupby": ["state"],
    }, FakeReadGroupOdoo())

    assert result["count"] == 120
    assert result["limit"] == 0
    assert result["truncated"] is False


async def test_read_file_reports_partial_slice(tmp_path: Path):
    path = tmp_path / "demo.py"
    path.write_text("\n".join(f"line {i}" for i in range(1, 1201)), encoding="utf-8")

    result = await read_file({"path": "demo.py", "max_lines": 1000}, str(tmp_path), include_enterprise=False)

    assert result["ok"] is True
    assert result["returned_lines"] == 1000
    assert result["total_lines"] == 1200
    assert result["truncated"] is True
    assert "Lecture partielle" in result["warning"]


def test_list_project_modules_scans_all_manifests_and_marks_return_limit(tmp_path: Path):
    for idx in range(5):
        module_dir = tmp_path / f"module_{idx}"
        module_dir.mkdir()
        (module_dir / "__manifest__.py").write_text("{'name': 'M', 'depends': []}", encoding="utf-8")

    result = list_project_modules(str(tmp_path), limit=3)

    assert result["scanned_manifests"] == 5
    assert result["total_modules"] == 5
    assert result["returned_modules"] == 3
    assert result["truncated"] is True
    assert "bornée" in result["warning"]
