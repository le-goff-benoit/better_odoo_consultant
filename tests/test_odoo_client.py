from unittest.mock import patch, MagicMock
from odoo_consultant_portal.services.odoo_client import OdooClient


def make_client():
    return OdooClient("https://demo.odoo.com", "demo", "admin", "key123")


def test_authenticate_success():
    client = make_client()
    with patch.object(client._common, "authenticate", return_value=1):
        uid = client.authenticate()
        assert uid == 1


def test_authenticate_failure():
    client = make_client()
    with patch.object(client._common, "authenticate", return_value=False):
        import pytest
        with pytest.raises(ValueError):
            client.authenticate()


def test_export_markdown():
    client = make_client()
    records = [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]
    md = client.export_markdown(records)
    assert "Alice" in md
    assert "---" in md or "|" in md


def test_export_csv():
    client = make_client()
    records = [{"id": 1, "name": "Alice"}]
    csv_text = client.export_csv(records)
    assert "Alice" in csv_text
    assert "id" in csv_text
