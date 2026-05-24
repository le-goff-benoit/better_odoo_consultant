#!/usr/bin/env python3
"""explain_domain.py — traduit un domain Odoo en langage clair.

Prend un domain Odoo (format Python littéral, ex.
``[('state','=','done'),('date','>=','2025-01-01')]``) et le rend lisible
pour un humain non-développeur. Utile pour expliquer une recherche à un
client ou auditer un filtre Studio.

Usage :
    explain_domain.py "[('state','=','done'),('amount_total','>',1000)]"
    echo "[...]" | explain_domain.py -

Sortie : Markdown sur stdout. Code retour 0 si OK, 2 si parse error.
"""
from __future__ import annotations

import argparse
import ast
import sys
from typing import Any

_OPS = {
    "=": "égal à",
    "!=": "différent de",
    ">": "supérieur à",
    ">=": "supérieur ou égal à",
    "<": "inférieur à",
    "<=": "inférieur ou égal à",
    "like": "contient (case-sensitive)",
    "ilike": "contient",
    "not like": "ne contient pas (case-sensitive)",
    "not ilike": "ne contient pas",
    "in": "dans la liste",
    "not in": "hors de la liste",
    "=like": "ressemble à (case-sensitive)",
    "=ilike": "ressemble à",
    "child_of": "enfant de",
    "parent_of": "parent de",
}


def _fmt_value(v: Any) -> str:
    if isinstance(v, bool):
        return "Vrai" if v else "Faux"
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(_fmt_value(x) for x in v) + "]"
    if isinstance(v, str):
        return f'"{v}"'
    return str(v)


def _explain_leaf(leaf: tuple) -> str:
    field, op, value = leaf
    op_label = _OPS.get(op, op)
    return f"`{field}` {op_label} {_fmt_value(value)}"


def explain(domain: list) -> str:
    """Convertit récursivement un domain Odoo en bullet list Markdown.
    Gère les opérateurs polonais préfixés ``&``, ``|``, ``!``."""
    if not domain:
        return "_(aucun filtre — sélectionne tout)_"

    lines = ["**Le filtre sélectionne les enregistrements tels que** :", ""]
    stack: list[str] = []
    # On part du principe d'un AND implicite entre clauses (convention Odoo).
    operators_stack: list[str] = []

    def emit_line(text: str):
        lines.append(f"- {text}")

    # Simplification : on rend séquentiellement, en signalant explicitement
    # les opérateurs préfixés (un domain complexe reste analysable, juste
    # pas en arbre joli — c'est volontaire pour rester compact).
    for item in domain:
        if isinstance(item, str):
            if item == "&":
                emit_line("**ET**")
            elif item == "|":
                emit_line("**OU**")
            elif item == "!":
                emit_line("**NON**")
            else:
                emit_line(f"opérateur inconnu : `{item}`")
        elif isinstance(item, (list, tuple)) and len(item) == 3:
            emit_line(_explain_leaf(tuple(item)))
        else:
            emit_line(f"clause non reconnue : `{item}`")

    if not any(s in ("&", "|", "!") for s in domain if isinstance(s, str)):
        lines.append("")
        lines.append("_(clauses combinées avec `ET` implicite)_")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("domain", help="Domain Odoo (string Python littéral) ou '-' pour stdin")
    args = parser.parse_args()

    raw = sys.stdin.read().strip() if args.domain == "-" else args.domain
    try:
        domain = ast.literal_eval(raw)
    except (ValueError, SyntaxError) as exc:
        print(f"error: domain invalide ({exc})", file=sys.stderr)
        return 2

    if not isinstance(domain, list):
        print("error: le domain doit être une liste Python", file=sys.stderr)
        return 2

    print(explain(domain))
    return 0


if __name__ == "__main__":
    sys.exit(main())
