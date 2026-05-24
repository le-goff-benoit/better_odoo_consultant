#!/usr/bin/env python3
"""scan_studio_customizations.py — audit des personnalisations Studio.

Liste exhaustivement les enregistrements rattachés au module ``studio_customization``
(modèles, vues, champs, menus, automatisations) en groupant par type d'objet et
en triant par date de dernière modification.

Usage :
    scan_studio_customizations.py \\
        --url http://localhost:8069 --db demo --login admin --password admin

Sortie : JSON sur stdout. Code retour 0 si OK, 2 si Odoo indisponible.
"""
from __future__ import annotations

import argparse
import json
import sys
import xmlrpc.client
from collections import Counter
from typing import Any


def _connect(url: str, db: str, login: str, password: str) -> tuple[Any, int]:
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, login, password, {})
    if not uid:
        raise RuntimeError("Authentication failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid


def scan(url: str, db: str, login: str, password: str) -> dict:
    models, uid = _connect(url, db, login, password)

    def call(model: str, method: str, *args, **kwargs):
        return models.execute_kw(db, uid, password, model, method, list(args), kwargs)

    # Tous les ir.model.data rattachés à studio_customization (et variantes).
    data_ids = call("ir.model.data", "search", [
        ["module", "in", ["studio_customization", "web_studio"]],
    ])
    records = call("ir.model.data", "read", data_ids,
                   {"fields": ["model", "module", "name", "res_id", "write_date"]})

    by_type: Counter = Counter()
    samples: dict[str, list] = {}
    for r in records:
        m = r["model"]
        by_type[m] += 1
        samples.setdefault(m, []).append({
            "name": r["name"],
            "res_id": r["res_id"],
            "write_date": r["write_date"],
        })

    # Champs Studio (state='manual', name LIKE x_studio_%).
    field_ids = call("ir.model.fields", "search", [
        ["state", "=", "manual"],
        ["name", "=like", "x_studio_%"],
    ])
    fields = call("ir.model.fields", "read", field_ids,
                  {"fields": ["model", "name", "ttype", "store"]})

    fields_by_model: dict[str, list] = {}
    for f in fields:
        fields_by_model.setdefault(f["model"], []).append({
            "name": f["name"], "type": f["ttype"], "stored": f["store"],
        })

    return {
        "summary": {
            "total_records": len(records),
            "by_type": dict(by_type.most_common()),
            "total_studio_fields": len(fields),
            "models_with_studio_fields": len(fields_by_model),
        },
        "records_by_type": {k: sorted(v, key=lambda x: x["write_date"], reverse=True)[:5]
                            for k, v in samples.items()},
        "studio_fields_by_model": fields_by_model,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--url", required=True, help="Odoo base URL")
    parser.add_argument("--db", required=True)
    parser.add_argument("--login", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    try:
        result = scan(args.url, args.db, args.login, args.password)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
