from typing import Optional

_KEYRING_AVAILABLE = False
try:
    import keyring
    _KEYRING_AVAILABLE = True
except Exception:
    pass

_fallback: dict[str, str] = {}
SERVICE = "odoo-consultant-portal"


def store_secret(key: str, value: str) -> None:
    if _KEYRING_AVAILABLE:
        keyring.set_password(SERVICE, key, value)
    else:
        _fallback[key] = value


def get_secret(key: str) -> Optional[str]:
    if _KEYRING_AVAILABLE:
        return keyring.get_password(SERVICE, key)
    return _fallback.get(key)


def delete_secret(key: str) -> None:
    if _KEYRING_AVAILABLE:
        try:
            keyring.delete_password(SERVICE, key)
        except Exception:
            pass
    else:
        _fallback.pop(key, None)
