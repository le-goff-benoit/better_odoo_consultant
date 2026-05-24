from pathlib import Path

from backend.skills.registry import SKILL_DEFINITIONS
from backend.skills.project_modules import list_project_modules


def test_skill_registry_bodies_exist():
    missing = [
        skill.name
        for skill in SKILL_DEFINITIONS
        if not skill.body.strip()
    ]

    assert missing == []


def test_list_project_modules_parses_manifests(tmp_path: Path):
    module = tmp_path / "custom_sale"
    module.mkdir()
    (module / "__manifest__.py").write_text(
        "{\n"
        "  'name': 'Custom Sale',\n"
        "  'version': '18.0.1.0.0',\n"
        "  'depends': ['sale', 'account'],\n"
        "  'data': ['views/sale_order.xml'],\n"
        "  'assets': {'web.assets_backend': ['custom_sale/static/src/x.js']},\n"
        "}\n",
        encoding="utf-8",
    )

    result = list_project_modules(str(tmp_path))

    assert result["ok"] is True
    assert result["scanned_manifests"] == 1
    assert result["modules"][0]["technical_name"] == "custom_sale"
    assert result["modules"][0]["depends"] == ["sale", "account"]
    assert result["modules"][0]["data_files"] == 1
    assert result["modules"][0]["assets_bundles"] == ["web.assets_backend"]


def test_list_project_modules_rejects_traversal(tmp_path: Path):
    result = list_project_modules(str(tmp_path), path="../")

    assert result["ok"] is False
    assert "Chemin invalide" in result["error"]
