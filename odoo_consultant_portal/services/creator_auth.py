"""Dedicated application password gating the Creator tool.

The Creator performs live writes on production / test Odoo databases, so the
menu is locked behind a password the consultant sets once. The password is
never stored in clear: only a PBKDF2-SHA256 hash (stdlib, no extra dependency)
is kept in the OS keyring, alongside any other portal secret.
"""

import hashlib
import hmac
import os

from .keyring_service import store_secret, get_secret, delete_secret

_KEY = "creator:password_hash"
_ITERATIONS = 240_000
_MIN_LENGTH = 4


def is_password_set() -> bool:
    return bool(get_secret(_KEY))


def set_password(password: str) -> None:
    password = (password or "").strip()
    if len(password) < _MIN_LENGTH:
        raise ValueError(f"Mot de passe trop court ({_MIN_LENGTH} caractères minimum).")
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    store_secret(_KEY, f"{salt.hex()}${digest.hex()}")


def verify_password(password: str) -> bool:
    stored = get_secret(_KEY)
    if not stored or "$" not in stored:
        return False
    salt_hex, digest_hex = stored.split("$", 1)
    try:
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", (password or "").encode("utf-8"), salt, _ITERATIONS
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def clear_password() -> None:
    delete_secret(_KEY)
