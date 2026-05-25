"""Validate Creator changeset operations before they reach the dry-run.

Two layers:
1. Pydantic schemas (structural shape, types, enums, regex).
2. Business rules (`x_` prefix, Python `ast.parse()`, missing `depends`
   on a compute, transactional model guard, etc.).

Validators return a structured list of issues per operation — `error` (would
break Odoo) or `warning` (passes Odoo but degrades quality). They never raise:
the caller (Creator UI / pre-flight) decides what to do.

Authoritative validation still happens at apply time in ``creator_executor``;
this module catches the obvious problems earlier so the consultant sees a
clean punch list before validating.
"""

from __future__ import annotations

import ast
import re
from typing import Any, Literal, Optional
from xml.etree import ElementTree as ET

from pydantic import BaseModel, Field, ValidationError, field_validator

# ── Issue shape ───────────────────────────────────────────────────

Severity = Literal["error", "warning"]


class Issue(BaseModel):
    field: Optional[str] = None
    severity: Severity
    message: str


# ── Shared constants ──────────────────────────────────────────────

_FIELD_NAME_RE = re.compile(r"^x_[a-z][a-z0-9_]*$")
_TTYPES = {
    "char", "text", "html", "integer", "float", "monetary",
    "boolean", "date", "datetime", "selection",
    "many2one", "one2many", "many2many", "binary",
}
_RELATIONAL_TTYPES = {"many2one", "one2many", "many2many"}
_AUTOMATION_TRIGGERS = {
    "on_create", "on_write", "on_create_or_write", "on_unlink", "on_time",
}
_CRON_INTERVALS = {"minutes", "hours", "days", "weeks", "months"}
_SERVER_ACTION_STATES = {"code", "object_create", "object_write", "multi"}

# Models the consultant must NEVER touch via create / update — matches the
# rule in creator-conventions.md. Touching them would corrupt ventes / compta /
# stock flows.
_TRANSACTIONAL_MODELS = {
    "sale.order", "sale.order.line",
    "account.move", "account.move.line", "account.payment",
    "stock.move", "stock.move.line", "stock.picking",
    "stock.valuation.layer",
    "account.bank.statement", "account.bank.statement.line",
    "pos.order", "pos.order.line",
}


# ── Pydantic schemas per op type ─────────────────────────────────


class _CreateFieldParams(BaseModel):
    model: str = Field(min_length=1)
    name: str = Field(min_length=1)
    ttype: str = Field(min_length=1)
    field_description: Optional[str] = None
    relation: Optional[str] = None
    relation_field: Optional[str] = None
    selection: Optional[list] = None
    required: Optional[bool] = None
    store: Optional[bool] = None
    help: Optional[str] = None
    compute: Optional[str] = None
    depends: Optional[str] = None

    @field_validator("ttype")
    @classmethod
    def _ttype_allowed(cls, v: str) -> str:
        if v not in _TTYPES:
            raise ValueError(f"ttype '{v}' inconnu (attendu : {sorted(_TTYPES)})")
        return v


class _ModifyViewParams(BaseModel):
    model: str = Field(min_length=1)
    arch: str = Field(min_length=1)
    view_type: Optional[str] = None
    inherit_id: Optional[int] = None
    inherit_xmlid: Optional[str] = None


class _ModifyReportParams(BaseModel):
    arch: str = Field(min_length=1)
    template_key: Optional[str] = None
    inherit_xmlid: Optional[str] = None
    report_name: Optional[str] = None


class _CreateServerActionParams(BaseModel):
    model: str = Field(min_length=1)
    name: str = Field(min_length=1)
    state: Optional[str] = None
    code: Optional[str] = None
    binding: Optional[bool] = None

    @field_validator("state")
    @classmethod
    def _state_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _SERVER_ACTION_STATES:
            raise ValueError(f"state '{v}' inconnu (attendu : {sorted(_SERVER_ACTION_STATES)})")
        return v


class _CreateAutomationParams(BaseModel):
    model: str = Field(min_length=1)
    name: str = Field(min_length=1)
    trigger: str = Field(min_length=1)
    code: Optional[str] = None
    filter_domain: Optional[str] = None

    @field_validator("trigger")
    @classmethod
    def _trigger_allowed(cls, v: str) -> str:
        if v not in _AUTOMATION_TRIGGERS:
            raise ValueError(f"trigger '{v}' inconnu (attendu : {sorted(_AUTOMATION_TRIGGERS)})")
        return v


class _CreateCronParams(BaseModel):
    model: str = Field(min_length=1)
    name: str = Field(min_length=1)
    code: str = Field(min_length=1)
    interval_number: int = Field(gt=0)
    interval_type: str

    @field_validator("interval_type")
    @classmethod
    def _interval_type_allowed(cls, v: str) -> str:
        if v not in _CRON_INTERVALS:
            raise ValueError(f"interval_type '{v}' inconnu (attendu : {sorted(_CRON_INTERVALS)})")
        return v


class _CreateRecordParams(BaseModel):
    model: str = Field(min_length=1)
    values: dict
    label: Optional[str] = None

    @field_validator("values")
    @classmethod
    def _values_not_empty(cls, v: dict) -> dict:
        if not v:
            raise ValueError("`values` ne peut pas être vide — fournis les valeurs concrètes du champ.")
        return v


class _RecordTarget(BaseModel):
    id: int
    display_name: Optional[str] = None


class _UpdateRecordParams(BaseModel):
    model: str = Field(min_length=1)
    targets: list[_RecordTarget] = Field(min_length=1)
    values: dict

    @field_validator("values")
    @classmethod
    def _values_not_empty(cls, v: dict) -> dict:
        if not v:
            raise ValueError("`values` ne peut pas être vide pour un update.")
        return v


class _DeleteRecordParams(BaseModel):
    model: str = Field(min_length=1)
    targets: list[_RecordTarget] = Field(min_length=1)


_SCHEMAS: dict[str, type[BaseModel]] = {
    "create_field": _CreateFieldParams,
    "modify_view": _ModifyViewParams,
    "modify_report": _ModifyReportParams,
    "create_server_action": _CreateServerActionParams,
    "create_automation": _CreateAutomationParams,
    "create_cron": _CreateCronParams,
    "create_record": _CreateRecordParams,
    "update_record": _UpdateRecordParams,
    "delete_record": _DeleteRecordParams,
}


# ── Business rules — extra checks beyond schema shape ────────────


def _check_python_code(code: Optional[str], field: str = "code") -> list[Issue]:
    """Best-effort parse; the LLM's snippets can be Python or QWeb-ish — only
    flag clearly malformed Python, not stylistic concerns."""
    if not code or not isinstance(code, str):
        return []
    try:
        ast.parse(code)
        return []
    except SyntaxError as exc:
        return [Issue(field=field, severity="error",
                     message=f"Code Python invalide ({exc.msg}, ligne {exc.lineno}).")]


def _check_arch_xml(arch: Optional[str], field: str = "arch") -> list[Issue]:
    if not arch:
        return []
    try:
        ET.fromstring(arch)
        return []
    except ET.ParseError as exc:
        return [Issue(field=field, severity="error",
                     message=f"XML invalide : {exc}")]


# Same simple-Studio-xpath shape as in studio_feasibility_service — kept in
# sync via the shared `extract_xpath_specs` helper imported there. Anything
# else is likely to fail at executor dry-run time (XPath without target).
def _check_xpath_complexity(arch: Optional[str]) -> list[Issue]:
    if not arch:
        return []
    # Local import to avoid a circular dependency at module load.
    from .studio_feasibility_service import extract_xpath_specs, _basic_xpath
    issues: list[Issue] = []
    for expr, _position in extract_xpath_specs(arch):
        if not _basic_xpath(expr):
            issues.append(Issue(
                field="arch", severity="warning",
                message=f"XPath `{expr}` n'est pas du shape Studio "
                        "`//page[@name='x']` / `//field[@name='x']` — l'executor "
                        "risque de rejeter la cible (« XPath sans cible »). "
                        "Préférer un xpath simple sur un seul ancrage nommé.",
            ))
    return issues


def _rules_create_field(p: dict) -> list[Issue]:
    issues: list[Issue] = []
    name = (p.get("name") or "").strip()
    if name and not _FIELD_NAME_RE.match(name):
        issues.append(Issue(
            field="name", severity="error",
            message=f"Le nom de champ '{name}' ne respecte pas la convention Studio "
                    "`x_<snake_case>` (lettres minuscules, chiffres, underscores)."
        ))
    ttype = (p.get("ttype") or "").strip()
    if ttype in _RELATIONAL_TTYPES and not p.get("relation"):
        issues.append(Issue(
            field="relation", severity="error",
            message=f"Champ {ttype} : `relation` (modèle cible) manquant."
        ))
    if ttype == "one2many" and not p.get("relation_field"):
        issues.append(Issue(
            field="relation_field", severity="error",
            message="Champ one2many : `relation_field` (champ inverse) manquant."
        ))
    if ttype == "selection":
        sel = p.get("selection")
        if not sel or not isinstance(sel, list):
            issues.append(Issue(
                field="selection", severity="error",
                message="Champ selection : `selection` (liste de [valeur, libellé]) manquant."
            ))
        else:
            for i, item in enumerate(sel):
                if not isinstance(item, (list, tuple)) or len(item) < 2:
                    issues.append(Issue(
                        field=f"selection[{i}]", severity="error",
                        message="Chaque entrée de `selection` doit être `[valeur_technique, libellé]`."
                    ))
                    break
    if p.get("compute"):
        issues.extend(_check_python_code(p.get("compute"), field="compute"))
        if not p.get("depends"):
            issues.append(Issue(
                field="depends", severity="warning",
                message="Champ calculé sans `depends` — il ne sera jamais recalculé "
                        "automatiquement quand ses sources changent."
            ))
    if p.get("compute") and "record." in (p.get("compute") or "") \
            and "[" not in (p.get("compute") or ""):
        # Heuristic: `record.x_field = …` is STORE_ATTR-forbidden in safe_eval.
        if re.search(r"\brecord\.\w+\s*=", p.get("compute") or ""):
            issues.append(Issue(
                field="compute", severity="error",
                message="Assignation `record.x_field = …` interdite dans safe_eval "
                        "(opcode STORE_ATTR refusé). Utilise `record['x_field'] = …`."
            ))
    return issues


def _rules_modify_view(p: dict) -> list[Issue]:
    issues: list[Issue] = []
    issues.extend(_check_arch_xml(p.get("arch")))
    if not p.get("inherit_id") and not p.get("inherit_xmlid"):
        issues.append(Issue(
            field="inherit_id", severity="error",
            message="`inherit_id` ou `inherit_xmlid` requis — une modify_view doit "
                    "hériter d'une vue parente."
        ))
    issues.extend(_check_xpath_complexity(p.get("arch")))
    return issues


def _rules_modify_report(p: dict) -> list[Issue]:
    issues: list[Issue] = []
    issues.extend(_check_arch_xml(p.get("arch")))
    if not p.get("template_key") and not p.get("inherit_xmlid"):
        issues.append(Issue(
            field="template_key", severity="error",
            message="`template_key` ou `inherit_xmlid` requis pour identifier le "
                    "template QWeb parent."
        ))
    arch = p.get("arch") or ""
    if "<field " in arch and "t-field" not in arch and "t-out" not in arch:
        issues.append(Issue(
            field="arch", severity="warning",
            message="`<field name=...>` détecté dans un rapport QWeb — utiliser "
                    "`<span t-field=\"o.x_y\"/>` ou `<span t-out=\"o.x_y\"/>` pour "
                    "que la valeur s'affiche dans le PDF."
        ))
    # QWeb reports legitimately target by class / t-call rather than
    # `[@name='x']`, so the Studio-style xpath check belongs to modify_view
    # only — running it on reports would flood the punch list with noise.
    return issues


def _rules_create_server_action(p: dict) -> list[Issue]:
    issues: list[Issue] = []
    state = p.get("state") or "code"
    if state == "code":
        if not p.get("code"):
            issues.append(Issue(
                field="code", severity="error",
                message="Action serveur `state=code` : `code` Python manquant."
            ))
        else:
            issues.extend(_check_python_code(p.get("code")))
    return issues


def _rules_create_automation(p: dict) -> list[Issue]:
    issues = list(_check_python_code(p.get("code")))
    if not p.get("code"):
        issues.append(Issue(
            field="code", severity="warning",
            message="Automatisation sans `code` — précise au moins une action à exécuter."
        ))
    return issues


def _rules_create_cron(p: dict) -> list[Issue]:
    return list(_check_python_code(p.get("code")))


def _rules_records_target_check(model: str, kind: str) -> list[Issue]:
    if model in _TRANSACTIONAL_MODELS:
        return [Issue(
            field="model", severity="error",
            message=f"Modèle transactionnel '{model}' protégé — `{kind}` strictement "
                    "interdit (flux ventes / compta / stock)."
        )]
    return []


def _rules_create_record(p: dict) -> list[Issue]:
    return _rules_records_target_check(p.get("model") or "", "create_record")


def _rules_update_record(p: dict) -> list[Issue]:
    issues = _rules_records_target_check(p.get("model") or "", "update_record")
    values = p.get("values") or {}
    if isinstance(values, dict):
        for key, val in values.items():
            if isinstance(val, list):
                issues.append(Issue(
                    field=f"values.{key}", severity="warning",
                    message="`update_record` ne gère pas les listes/many2many. "
                            "Passe par le modèle enfant pour modifier une one2many."
                ))
                break
    return issues


def _rules_delete_record(p: dict) -> list[Issue]:
    return _rules_records_target_check(p.get("model") or "", "delete_record")


_RULES: dict[str, Any] = {
    "create_field": _rules_create_field,
    "modify_view": _rules_modify_view,
    "modify_report": _rules_modify_report,
    "create_server_action": _rules_create_server_action,
    "create_automation": _rules_create_automation,
    "create_cron": _rules_create_cron,
    "create_record": _rules_create_record,
    "update_record": _rules_update_record,
    "delete_record": _rules_delete_record,
}


# ── Public API ───────────────────────────────────────────────────


def validate_operation(op: dict) -> list[dict]:
    """Validate a single Creator operation. Returns a list of issue dicts —
    empty when the op is clean."""
    op_type = (op.get("type") or "").strip()
    schema = _SCHEMAS.get(op_type)
    if not schema:
        return [Issue(
            field="type", severity="error",
            message=f"Type d'opération inconnu : '{op_type}'."
        ).model_dump()]
    params = op.get("params") or {}
    if not isinstance(params, dict):
        return [Issue(field="params", severity="error",
                      message="`params` manquant ou invalide.").model_dump()]
    issues: list[Issue] = []
    try:
        schema(**params)
    except ValidationError as exc:
        for err in exc.errors():
            loc = ".".join(str(p) for p in err.get("loc", ()) if p != "__root__")
            issues.append(Issue(
                field=loc or None, severity="error",
                message=err.get("msg") or "Paramètre invalide."
            ))
    # Business rules run even when the schema fails — they may surface other
    # issues the consultant should see in the same punch list.
    issues.extend(_RULES[op_type](params))
    return [i.model_dump() for i in issues]


def validate_changeset(operations: list[dict]) -> dict[str, Any]:
    """Validate the whole changeset. Returns `{ok, operations: [{index, type, issues}]}`.

    `ok` is True iff no operation has any error-severity issue. Warnings do not
    fail the changeset — they are surfaced for the consultant to consider."""
    per_op = []
    has_error = False
    for i, op in enumerate(operations or []):
        issues = validate_operation(op)
        if any(issue["severity"] == "error" for issue in issues):
            has_error = True
        per_op.append({
            "index": i,
            "type": (op.get("type") or "").strip(),
            "issues": issues,
        })
    return {"ok": not has_error, "operations": per_op}
