from .keyring_service import store_secret, get_secret, delete_secret


def store_profile_secrets(profile_name: str, api_key: str) -> None:
    store_secret(f"profile:{profile_name}:api_key", api_key)


def get_profile_api_key(profile_name: str) -> str | None:
    return get_secret(f"profile:{profile_name}:api_key")


def delete_profile_secrets(profile_name: str) -> None:
    delete_secret(f"profile:{profile_name}:api_key")
