import json
from .keyring_service import store_secret, get_secret, delete_secret


def store_profile_secrets(profile_name: str, api_key: str) -> None:
    store_secret(f"profile:{profile_name}:api_key", api_key)


def get_profile_api_key(profile_name: str) -> str | None:
    return get_secret(f"profile:{profile_name}:api_key")


def delete_profile_secrets(profile_name: str) -> None:
    delete_secret(f"profile:{profile_name}:api_key")


# ── Per-environment API keys ───────────────────────────────────────

def store_env_api_key(profile_name: str, env_id: str, api_key: str) -> None:
    store_secret(f"profile:{profile_name}:env:{env_id}:api_key", api_key)


def get_env_api_key(profile_name: str, env_id: str) -> str | None:
    return get_secret(f"profile:{profile_name}:env:{env_id}:api_key")


def delete_env_api_key(profile_name: str, env_id: str) -> None:
    delete_secret(f"profile:{profile_name}:env:{env_id}:api_key")


# ── Active env resolution ──────────────────────────────────────────

def get_active_env_from_json(
    environments_json: str | None,
    active_env_id: str | None,
    fallback: dict,
) -> dict:
    """Return the active environment dict from a profile's environments JSON.
    Falls back to a synthetic 'prod' entry built from legacy profile fields."""
    try:
        envs: list[dict] = json.loads(environments_json or "[]")
    except Exception:
        envs = []
    if not envs:
        return {"id": "prod", **fallback}
    target_id = active_env_id or envs[0].get("id")
    for env in envs:
        if env.get("id") == target_id:
            return env
    return envs[0]


def get_active_api_key(profile_name: str, env_id: str) -> str | None:
    """Get the API key for a profile's environment. Falls back to the legacy key."""
    key = get_env_api_key(profile_name, env_id)
    if not key:
        key = get_profile_api_key(profile_name)
    return key
