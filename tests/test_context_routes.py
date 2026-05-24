import pytest


@pytest.mark.asyncio
async def test_context_route_serves_skill_default_file(client):
    resp = await client.get("/api/context/file/skill-query-odoo.md?locale=fr")

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "skill-query-odoo.md"
    assert "## query_odoo" in data["content"]


@pytest.mark.asyncio
async def test_context_route_serves_skill_default_file_in_english(client):
    resp = await client.get("/api/context/file/skill-query-odoo.md?locale=en")

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "skill-query-odoo.md"
    assert "query_odoo" in data["content"]
