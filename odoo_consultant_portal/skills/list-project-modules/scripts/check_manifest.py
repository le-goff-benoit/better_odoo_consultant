#!/usr/bin/env python3
"""check_manifest.py — audit des fichiers __manifest__.py d'un dépôt Odoo.

Pour chaque module trouvé sous la racine fournie, vérifie :
* présence des clés essentielles (name, version, depends, license)
* version au format X.Y.Z.W.V (5 segments — convention Odoo)
* chaque dépendance listée dans ``depends`` est résoluble (cherchée
  dans le même dépôt OU dans odoo/odoo standard listé en argument)
* les fichiers déclarés dans ``data``, ``demo``, ``qweb`` existent

Usage :
    check_manifest.py /path/to/repo
    check_manifest.py /path/to/repo --standard-modules sale,purchase,stock

Sortie : JSON sur stdout. Code retour 0 si tous OK, 1 si au moins un défaut.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path
from typing import Any

_REQUIRED_KEYS = ("name", "version", "depends")
_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+\.\d+\.\d+$")


def _read_manifest(path: Path) -> dict | None:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (OSError, SyntaxError):
        return None
    for node in tree.body:
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Dict):
            try:
                return ast.literal_eval(node.value)
            except (ValueError, SyntaxError):
                return None
    return None


def audit_module(folder: Path, known_modules: set[str]) -> dict:
    manifest_path = folder / "__manifest__.py"
    issues: list[str] = []
    warnings: list[str] = []

    manifest = _read_manifest(manifest_path)
    if manifest is None:
        return {
            "module": folder.name,
            "ok": False,
            "issues": ["manifest illisible (parse error)"],
            "warnings": [],
        }

    for key in _REQUIRED_KEYS:
        if key not in manifest:
            issues.append(f"clé manquante : `{key}`")

    version = manifest.get("version", "")
    if version and not _VERSION_RE.match(str(version)):
        warnings.append(f"version `{version}` ne suit pas la convention 5 segments (X.Y.Z.W.V)")

    for dep in manifest.get("depends", []):
        if dep not in known_modules:
            issues.append(f"dépendance introuvable : `{dep}`")

    base = folder
    for key in ("data", "demo", "qweb"):
        for f in manifest.get(key, []):
            if not (base / f).exists():
                issues.append(f"fichier `{key}` déclaré mais absent : `{f}`")

    if "license" not in manifest:
        warnings.append("clé `license` manquante (recommandé : LGPL-3 ou OEEL-1)")

    return {
        "module": folder.name,
        "version": str(version),
        "ok": not issues,
        "issues": issues,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("root", help="Racine du dépôt à auditer")
    parser.add_argument("--standard-modules", default="",
                        help="Liste séparée par des virgules de modules Odoo standard considérés disponibles")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f"error: {root} n'est pas un dossier", file=sys.stderr)
        return 2

    module_folders = [p for p in sorted(root.rglob("__manifest__.py"))]
    custom_modules = {p.parent.name for p in module_folders}
    standard = {m.strip() for m in args.standard_modules.split(",") if m.strip()}
    known = custom_modules | standard | {"base"}

    audits = [audit_module(p.parent, known) for p in module_folders]
    total = len(audits)
    failed = sum(1 for a in audits if not a["ok"])

    result = {
        "root": str(root),
        "modules_scanned": total,
        "modules_with_issues": failed,
        "audits": audits,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
