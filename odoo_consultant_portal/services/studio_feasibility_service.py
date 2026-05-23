"""Decide whether a Creator changeset could be reproduced in Odoo Studio.

Studio is Odoo's no-code customization layer. It can cover a wide range of
field/view/automation work, but it has hard boundaries: data manipulation,
recurring jobs, and complex XPath/QWeb work fall outside its scope.

This module gives each operation in a changeset a verdict:
- ``feasible``      — Studio handles this case fully.
- ``with_caveats``  — Studio can do it, but only with extra steps or a
                      manual workaround (e.g. via the Technical/Settings menu).
- ``not_feasible``  — Studio cannot do this at all; only code / Technical
                      menus can.

The verdict is purely advisory: the Creator can still apply the change. The
goal is to teach the user *where* the Studio frontier sits for their request.
"""

from __future__ import annotations

import re
from typing import Any, Literal
from xml.etree import ElementTree as ET

Verdict = Literal["feasible", "with_caveats", "not_feasible"]

# Order matters: aggregate verdict picks the worst of any op verdict using
# this ranking — see ``_aggregate_verdict``.
_VERDICT_RANK = {"feasible": 0, "with_caveats": 1, "not_feasible": 2}


def _basic_xpath(expr: str) -> bool:
    """A Studio-generated XPath is always of the form ``//field[@name='x']``
    or ``//page[@name='x']`` — no axes, no position predicates, no logical
    operators. Anything more elaborate has likely been written by hand."""
    if not expr:
        return True
    raw = expr.strip()
    # Studio uses simple absolute paths on a single named element.
    simple = re.fullmatch(
        r"//(field|page|button|group|notebook|header|sheet)\[@name=['\"][\w.-]+['\"]\]",
        raw,
    )
    return bool(simple)


def extract_xpath_specs(arch: str) -> list[tuple[str, str]]:
    """Return ``[(expr, position), …]`` for every ``<xpath>`` node in *arch*.

    The Creator emits an inheritance arch like
    ``<data><xpath expr="…" position="…">…</xpath></data>`` — the actual
    xpath spec lives INSIDE the XML, never as a standalone ``op["xpath"]``
    field. Feasibility / validator rules must parse it to do any meaningful
    check. Best-effort: malformed XML returns an empty list (other rules
    flag the parse error separately)."""
    if not arch:
        return []
    try:
        root = ET.fromstring(arch)
    except ET.ParseError:
        return []
    specs: list[tuple[str, str]] = []
    # The root itself may be the <xpath> element.
    candidates = [root] + list(root.iter("xpath"))
    seen: set[int] = set()
    for node in candidates:
        if node.tag != "xpath" or id(node) in seen:
            continue
        seen.add(id(node))
        expr = (node.get("expr") or "").strip()
        position = (node.get("position") or "").strip().lower()
        if expr:
            specs.append((expr, position))
    return specs


def _evaluate_modify_view(op: dict) -> tuple[Verdict, list[str]]:
    """Studio's view editor handles drag-drop changes (add/move/hide field,
    add page, attribute tweak). It cannot match arbitrary XPath, and it does
    not let the user write inheritance with conditional position blocks."""
    reasons: list[str] = []
    # The xpath spec lives in op.params["arch"] (the inheritance XML), with
    # `op["xpath"]` and `op["operation"]` as legacy fallbacks. Parse the arch
    # first — that's where the LLM actually writes the spec today.
    params = op.get("params") if isinstance(op.get("params"), dict) else {}
    arch = params.get("arch") or op.get("arch") or ""
    specs = extract_xpath_specs(arch)
    # Legacy: a flat op.xpath / op.operation pair (older Creator schema).
    legacy_xpath = (op.get("xpath") or "").strip()
    legacy_op = (op.get("operation") or "").strip().lower()
    if legacy_xpath:
        specs.append((legacy_xpath, legacy_op))

    complex_exprs: list[str] = []
    has_replace = False
    for expr, position in specs:
        if not _basic_xpath(expr):
            complex_exprs.append(expr)
        if position == "replace":
            has_replace = True

    if complex_exprs:
        first = complex_exprs[0]
        suffix = f" (+{len(complex_exprs) - 1} autre(s))" if len(complex_exprs) > 1 else ""
        reasons.append(
            f"XPath complexe : `{first}`{suffix} — Studio génère uniquement des cibles "
            "simples comme `//page[@name='x']` ou `//field[@name='x']` (sans chemin "
            "absolu /form/sheet/notebook/…). L'executor risque de rejeter la cible."
        )

    # Studio writes inside/after/before/attributes; it does not produce
    # `replace` on whole elements.
    if has_replace:
        reasons.append(
            "Position 'replace' d'un nœud entier — Studio ne propose que ajouter, "
            "déplacer, masquer ou modifier un attribut."
        )

    if reasons:
        return ("with_caveats", reasons)
    return ("feasible", ["Vue éditable via Studio (ajout / déplacement / masquage de champ)."])


def _evaluate_create_field(op: dict) -> tuple[Verdict, list[str]]:
    """Studio creates any standard field type. Computed fields require the
    user to enter the Python expression, but Studio supports them."""
    notes = ["Studio crée le champ via l'éditeur de modèle."]
    ttype = (op.get("ttype") or op.get("field_type") or "").lower()
    if ttype in {"reference", "many2one_reference"}:
        return (
            "with_caveats",
            ["Type Reference rarement exposé dans l'UI Studio — passage par "
             "Paramètres → Technique souvent nécessaire."],
        )
    if op.get("compute") or op.get("compute_python"):
        notes.append("Champ calculé — Studio demande la formule Python dans l'éditeur.")
    return ("feasible", notes)


def _evaluate_create_server_action(op: dict) -> tuple[Verdict, list[str]]:
    state = (op.get("state") or "").lower()
    if state == "code":
        return (
            "with_caveats",
            ["Action serveur de type 'code' — l'éditeur Studio l'expose, mais elle "
             "demande d'écrire du Python dans le champ 'code'."],
        )
    return ("feasible", ["Action serveur configurable via Studio → onglet Automatisations."])


def _evaluate_create_automation(_op: dict) -> tuple[Verdict, list[str]]:
    return (
        "feasible",
        ["Automatisation (base.automation) entièrement gérée par Studio."],
    )


def _evaluate_create_cron(_op: dict) -> tuple[Verdict, list[str]]:
    return (
        "not_feasible",
        ["Studio n'expose pas la création d'actions planifiées (ir.cron) — "
         "passage obligé par Paramètres → Technique → Actions planifiées."],
    )


def _evaluate_modify_report(op: dict) -> tuple[Verdict, list[str]]:
    # Same as modify_view: the xpath lives inside the arch XML, not in a flat
    # op.xpath field. Parse the arch and check every <xpath> spec.
    params = op.get("params") if isinstance(op.get("params"), dict) else {}
    arch = params.get("arch") or op.get("arch") or ""
    specs = extract_xpath_specs(arch)
    legacy_xpath = (op.get("xpath") or "").strip()
    if legacy_xpath:
        specs.append((legacy_xpath, ""))
    complex_in_report = any(not _basic_xpath(expr) for expr, _pos in specs)
    if complex_in_report:
        return (
            "with_caveats",
            ["Studio dispose d'un éditeur de rapport limité — un XPath complexe "
             "sur un template QWeb sort de son périmètre, le rapport doit être "
             "modifié via une vue d'héritage."],
        )
    return (
        "with_caveats",
        ["L'éditeur de rapport Studio gère les ajouts simples ; les modifications "
         "profondes du template QWeb demandent une vue d'héritage."],
    )


def _evaluate_record_op(kind: str) -> tuple[Verdict, list[str]]:
    label = {"create_record": "Création", "update_record": "Mise à jour", "delete_record": "Suppression"}[kind]
    return (
        "not_feasible",
        [f"{label} d'un enregistrement — Studio ne manipule pas les données métier ; "
         "ce type d'opération passe par l'UI standard ou par Paramètres → Technique."],
    )


_EVALUATORS = {
    "modify_view": _evaluate_modify_view,
    "create_field": _evaluate_create_field,
    "create_server_action": _evaluate_create_server_action,
    "create_automation": _evaluate_create_automation,
    "create_cron": _evaluate_create_cron,
    "modify_report": _evaluate_modify_report,
    "create_record": lambda _op: _evaluate_record_op("create_record"),
    "update_record": lambda _op: _evaluate_record_op("update_record"),
    "delete_record": lambda _op: _evaluate_record_op("delete_record"),
}


def evaluate_operation(op: dict) -> dict[str, Any]:
    """Return the Studio verdict for a single changeset operation."""
    op_type = (op.get("type") or "").strip()
    evaluator = _EVALUATORS.get(op_type)
    if not evaluator:
        return {
            "type": op_type,
            "verdict": "with_caveats",
            "reasons": [f"Type d'opération inconnu pour l'évaluation Studio : '{op_type}'."],
        }
    verdict, reasons = evaluator(op)
    return {"type": op_type, "verdict": verdict, "reasons": reasons}


def _aggregate_verdict(per_op: list[dict]) -> Verdict:
    if not per_op:
        return "feasible"
    worst = max(_VERDICT_RANK[entry["verdict"]] for entry in per_op)
    return next(v for v, rank in _VERDICT_RANK.items() if rank == worst)


def evaluate_changeset(operations: list[dict]) -> dict[str, Any]:
    """Aggregate the Studio verdict for a whole changeset.

    Returns a dict with:
      - ``verdict`` — worst case across operations.
      - ``summary`` — short French sentence describing the verdict.
      - ``operations`` — per-op detail, indexed by changeset position.
    """
    per_op = [
        {"index": i, **evaluate_operation(op)}
        for i, op in enumerate(operations or [])
    ]
    verdict = _aggregate_verdict(per_op)
    summary = {
        "feasible": "Cette modification est entièrement réalisable dans Odoo Studio.",
        "with_caveats": "Réalisable dans Studio avec quelques manipulations hors éditeur visuel.",
        "not_feasible": "Au moins une opération sort du périmètre de Studio.",
    }[verdict]
    return {"verdict": verdict, "summary": summary, "operations": per_op}
