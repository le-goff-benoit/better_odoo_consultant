from unittest.mock import patch
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


def test_search_read_accepts_high_limit():
    client = make_client()
    client._uid = 1
    with patch.object(client._models, "execute_kw", return_value=[]) as execute_kw:
        client.search_read("res.partner", limit=5000)

    kwargs = execute_kw.call_args.args[-1]
    assert kwargs["limit"] == 5000


def test_search_read_omits_limit_for_unlimited_requests():
    client = make_client()
    client._uid = 1
    with patch.object(client._models, "execute_kw", return_value=[]) as execute_kw:
        client.search_read("res.partner", limit=0)

    kwargs = execute_kw.call_args.args[-1]
    assert "limit" not in kwargs
