"""Régression: PATCH profile avec api_key vide ne doit pas wiper le secret.

Bug avant fix: `model_dump(exclude_none=True)` n'exclut pas `""`, donc
`store_profile_secrets(name, "")` était appelé et écrasait la clé existante.
"""
import pytest

from backend.services.profile_manager import (
    store_profile_secrets,
    get_profile_api_key,
)


@pytest.mark.asyncio
async def test_patch_profile_with_empty_api_key_preserves_secret(client, monkeypatch):
    payload = {
        "name": "preserve-key-profile",
        "db_url": "https://odoo.example.com",
        "db_name": "db",
        "login": "admin",
        "api_key": "ORIGINAL_KEY_VALUE",
        "odoo_version": "18.0",
    }
    resp = await client.post("/api/profiles/", json=payload)
    assert resp.status_code == 200, resp.text
    profile_id = resp.json()["id"]

    assert get_profile_api_key("preserve-key-profile") == "ORIGINAL_KEY_VALUE"

    patch = {"login": "admin2", "api_key": ""}
    resp2 = await client.patch(f"/api/profiles/{profile_id}", json=patch)
    assert resp2.status_code == 200, resp2.text

    assert get_profile_api_key("preserve-key-profile") == "ORIGINAL_KEY_VALUE"

    resp3 = await client.patch(
        f"/api/profiles/{profile_id}", json={"api_key": "ROTATED_KEY"}
    )
    assert resp3.status_code == 200, resp3.text
    assert get_profile_api_key("preserve-key-profile") == "ROTATED_KEY"


@pytest.mark.asyncio
async def test_patch_profile_omitting_api_key_preserves_secret(client):
    payload = {
        "name": "omit-key-profile",
        "db_url": "https://odoo.example.com",
        "db_name": "db",
        "login": "admin",
        "api_key": "ORIGINAL_KEY_VALUE",
        "odoo_version": "18.0",
    }
    resp = await client.post("/api/profiles/", json=payload)
    assert resp.status_code == 200
    profile_id = resp.json()["id"]

    assert get_profile_api_key("omit-key-profile") == "ORIGINAL_KEY_VALUE"

    resp2 = await client.patch(
        f"/api/profiles/{profile_id}", json={"login": "admin2"}
    )
    assert resp2.status_code == 200
    assert get_profile_api_key("omit-key-profile") == "ORIGINAL_KEY_VALUE"
