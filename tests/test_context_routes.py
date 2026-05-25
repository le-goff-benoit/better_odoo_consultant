import pytest


@pytest.mark.asyncio
async def test_context_route_serves_general_default_file(client):
    resp = await client.get("/api/context/file/consultant-memo.md?locale=fr")

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "consultant-memo.md"
    assert "Mémo consultant Odoo" in data["content"]


@pytest.mark.asyncio
async def test_context_route_serves_general_default_file_in_english(client):
    resp = await client.get("/api/context/file/consultant-memo.md?locale=en")

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "consultant-memo.md"
    assert "Odoo consultant memo" in data["content"]


@pytest.mark.asyncio
async def test_context_route_serves_creator_conventions_default_file(client):
    resp = await client.get("/api/context/file/creator-conventions.md?locale=fr")

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "creator-conventions.md"
    assert "Conventions Odoo Studio" in data["content"]


@pytest.mark.asyncio
async def test_legacy_context_names_are_not_default_sources(client):
    for name in ("skills.md", "profile-creator.md"):
        resp = await client.get(f"/api/context/file/{name}?locale=fr")
        assert resp.status_code == 404
