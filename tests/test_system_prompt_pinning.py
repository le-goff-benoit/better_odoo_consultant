"""Regression tests for the version / country pinning in the system
prompt (v0.96.2). These cover four real bugs the user reported:

1. build_system used ``profile.odoo_version`` even when an environment
   override version was passed → mismatch with sources/queries.
2. build_system_migration had the same drift.
3. Project mode never surfaced the country/locale in the stable header
   — only via the routed priority block, vulnerable to budget pressure.
4. build_system_general never surfaced the user-selected ``country_code``
   at the top of the prompt.
"""
from __future__ import annotations

from types import SimpleNamespace

from backend.services.ai_service import (
    build_system,
    build_system_general,
    build_system_migration,
)


def _profile(**kwargs):
    base = dict(
        db_url="https://demo.acme.ch/odoo",
        db_name="acme_prod",
        company_name="Acme SA",
        odoo_version="17.0",
        user_access_info=None,
        project_context=None,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_build_system_uses_version_override_over_profile_version():
    stable, _ = build_system(_profile(), version_override="18.0")
    assert "- Version : 18.0" in stable
    assert "- Version : 17.0" not in stable


def test_build_system_falls_back_to_profile_version_when_no_override():
    stable, _ = build_system(_profile())
    assert "- Version : 17.0" in stable


def test_build_system_pins_country_in_instance_block():
    stable, _ = build_system(_profile(), country_code="ch", country_name="Switzerland")
    # The pinned country sits in the STABLE block so it survives any
    # routed-context truncation.
    assert "## Instance connectée" in stable
    assert "Pays fiscal : Switzerland (CH)" in stable


def test_build_system_country_uses_code_when_name_missing():
    stable, _ = build_system(_profile(), country_code="ch")
    assert "Pays fiscal : CH" in stable


def test_build_system_general_pins_version_and_country():
    stable, _ = build_system_general("17.0", country_code="ch", country_name="Switzerland")
    assert "## Version Odoo de référence\n17.0" in stable
    assert "## Pays / localisation fiscale" in stable
    assert "Switzerland (CH)" in stable


def test_build_system_general_without_country_omits_country_block():
    stable, _ = build_system_general("17.0")
    assert "## Pays / localisation fiscale" not in stable


def test_build_system_migration_prefers_explicit_source_version():
    # Profile says 17.0, but the migration source is being driven from
    # an env on 16.0 (real example: a staging env one minor below prod).
    stable, _ = build_system_migration(
        source_version="16.0", target_version="18.0",
        profile=_profile(odoo_version="17.0"),
    )
    assert "## Instance source connectée" in stable
    assert "- Version : 16.0" in stable
    assert "- Version : 17.0" not in stable


def test_build_system_migration_pins_country():
    stable, _ = build_system_migration(
        source_version="17.0", target_version="18.0",
        profile=_profile(),
        country_code="ch", country_name="Switzerland",
    )
    assert "Pays fiscal : Switzerland (CH)" in stable
