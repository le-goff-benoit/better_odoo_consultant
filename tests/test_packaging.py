"""
Tests that catch packaging and environment issues early.
These run without any app dependencies — pure stdlib only.
"""
import sys
import subprocess
from pathlib import Path
try:
    import tomllib
except ModuleNotFoundError:  # Python 3.10
    import tomli as tomllib

ROOT = Path(__file__).parent.parent
PYPROJECT = ROOT / "pyproject.toml"


def test_pyproject_exists():
    assert PYPROJECT.exists(), "pyproject.toml manquant"


def test_pyproject_parseable():
    data = tomllib.loads(PYPROJECT.read_text())
    assert "project" in data
    assert "build-system" in data


def test_build_backend_compatible():
    """setuptools.backends.legacy:build ne fonctionne qu'avec setuptools>=64.
    setuptools.build_meta est universel — c'est ce qu'on doit utiliser."""
    data = tomllib.loads(PYPROJECT.read_text())
    backend = data["build-system"]["build-backend"]
    assert backend == "setuptools.build_meta", (
        f"Build backend '{backend}' incompatible avec Python < 3.11. "
        "Utilisez 'setuptools.build_meta'."
    )


def test_setuptools_requires_not_too_restrictive():
    data = tomllib.loads(PYPROJECT.read_text())
    requires = data["build-system"].get("requires", [])
    for req in requires:
        if req.startswith("setuptools"):
            # Extraire le numéro de version minimum
            import re
            m = re.search(r">=(\d+)", req)
            if m:
                min_ver = int(m.group(1))
                assert min_ver <= 42, (
                    f"setuptools>={min_ver} trop récent — Python 3.10 livré avec setuptools ~42. "
                    "Abaissez à >=42 ou laissez install.sh faire le pip upgrade."
                )


def test_python_version_requirement():
    data = tomllib.loads(PYPROJECT.read_text())
    requires_python = data["project"].get("requires-python", "")
    # Doit accepter 3.10+
    import packaging.specifiers  # type: ignore[import]
    spec = packaging.specifiers.SpecifierSet(requires_python)
    assert "3.10" in spec, (
        f"requires-python='{requires_python}' exclut Python 3.10. "
        "Utilisez '>=3.10'."
    )


def test_package_importable():
    """Le package doit s'importer sans erreur."""
    import odoo_consultant_portal
    assert odoo_consultant_portal.__version__ == "0.10.0"


def test_cli_entry_point_importable():
    """Le point d'entrée CLI doit être importable."""
    from odoo_consultant_portal.cli.main import cli
    assert cli is not None


def test_core_modules_importable():
    """Les modules core doivent être importables sans démarrer de serveur."""
    from odoo_consultant_portal.core import config, models
    from odoo_consultant_portal.services import keyring_service, odoo_client
    assert True


def test_pip_install_dry_run():
    """Vérifie que pip peut résoudre les dépendances (dry-run, pas d'install réel)."""
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--dry-run", "--quiet", str(ROOT)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, (
        f"pip install --dry-run a échoué :\n{result.stderr}"
    )
