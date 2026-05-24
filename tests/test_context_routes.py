import pytest


@pytest.mark.asyncio
async def test_context_route_serves_general_default_file(client):
    resp = await client.get("/api/context/file/skills.md?locale=fr")

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "skills.md"
    assert "Compétences" in data["content"]


@pytest.mark.asyncio
async def test_context_route_serves_general_default_file_in_english(client):
    resp = await client.get("/api/context/file/skills.md?locale=en")

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "skills.md"
    assert "Skills" in data["content"]
