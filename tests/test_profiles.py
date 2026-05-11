import pytest


@pytest.mark.asyncio
async def test_list_profiles_empty(client):
    resp = await client.get("/api/profiles/")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_and_get_profile(client):
    payload = {
        "name": "test-profile",
        "db_url": "https://myodoo.example.com",
        "db_name": "mydb",
        "login": "admin",
        "api_key": "secret123",
        "odoo_version": "17.0",
    }
    resp = await client.post("/api/profiles/", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "test-profile"
    assert "api_key" not in data

    resp2 = await client.get(f"/api/profiles/{data['id']}")
    assert resp2.status_code == 200
    assert resp2.json()["name"] == "test-profile"


@pytest.mark.asyncio
async def test_duplicate_profile_name(client):
    payload = {
        "name": "dupe-profile",
        "db_url": "https://odoo.example.com",
        "db_name": "db",
        "login": "admin",
        "api_key": "key",
    }
    await client.post("/api/profiles/", json=payload)
    resp2 = await client.post("/api/profiles/", json=payload)
    assert resp2.status_code == 409
