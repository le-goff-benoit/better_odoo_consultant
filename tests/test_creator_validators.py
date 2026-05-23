"""Creator pre-flight validation — the punch list the consultant sees before
the dry-run, computed from schema constraints plus Studio business rules."""

import pytest

from odoo_consultant_portal.services.creator_validators import (
    validate_changeset,
    validate_operation,
)


def _errors(issues):
    return [i for i in issues if i["severity"] == "error"]


def _warnings(issues):
    return [i for i in issues if i["severity"] == "warning"]


# ── create_field ─────────────────────────────────────────────────


def test_create_field_clean_passes():
    op = {"type": "create_field", "params": {
        "model": "res.partner", "name": "x_note", "ttype": "char",
        "field_description": "Note libre",
    }}
    assert validate_operation(op) == []


def test_create_field_rejects_non_x_prefix():
    op = {"type": "create_field", "params": {
        "model": "res.partner", "name": "note", "ttype": "char",
    }}
    errors = _errors(validate_operation(op))
    assert any("convention Studio" in e["message"] for e in errors)


def test_create_field_rejects_unknown_ttype():
    op = {"type": "create_field", "params": {
        "model": "res.partner", "name": "x_note", "ttype": "json",
    }}
    errors = _errors(validate_operation(op))
    assert any("ttype" in e["message"] for e in errors)


def test_create_field_relational_requires_relation():
    op = {"type": "create_field", "params": {
        "model": "res.partner", "name": "x_other", "ttype": "many2one",
    }}
    errors = _errors(validate_operation(op))
    assert any("relation" in (e.get("field") or "") for e in errors)


def test_create_field_one2many_requires_relation_field():
    op = {"type": "create_field", "params": {
        "model": "res.partner", "name": "x_lines", "ttype": "one2many", "relation": "sale.order",
    }}
    errors = _errors(validate_operation(op))
    assert any("relation_field" in (e.get("field") or "") for e in errors)


def test_create_field_selection_requires_options():
    op = {"type": "create_field", "params": {
        "model": "res.partner", "name": "x_state", "ttype": "selection",
    }}
    errors = _errors(validate_operation(op))
    assert any("selection" in (e.get("field") or "") for e in errors)


def test_create_field_compute_without_depends_warns_only():
    op = {"type": "create_field", "params": {
        "model": "res.partner", "name": "x_total", "ttype": "integer",
        "compute": "for record in self:\n    record['x_total'] = 1",
    }}
    issues = validate_operation(op)
    assert _errors(issues) == []
    assert any("depends" in (w.get("field") or "") for w in _warnings(issues))


def test_create_field_compute_with_store_attr_assignment_is_error():
    op = {"type": "create_field", "params": {
        "model": "res.partner", "name": "x_total", "ttype": "integer",
        "depends": "name",
        "compute": "for record in self:\n    record.x_total = 1",
    }}
    errors = _errors(validate_operation(op))
    assert any("STORE_ATTR" in e["message"] for e in errors)


def test_create_field_compute_python_syntax_error():
    op = {"type": "create_field", "params": {
        "model": "res.partner", "name": "x_total", "ttype": "integer",
        "depends": "name",
        "compute": "for record in self\n    record['x_total'] = 1",  # missing colon
    }}
    errors = _errors(validate_operation(op))
    assert any("Code Python invalide" in e["message"] for e in errors)


# ── modify_view ──────────────────────────────────────────────────


def test_modify_view_requires_inherit_anchor():
    op = {"type": "modify_view", "params": {
        "model": "res.partner",
        "arch": "<data><xpath expr=\"//field[@name='name']\" position='after'/></data>",
    }}
    errors = _errors(validate_operation(op))
    assert any("inherit_id" in (e.get("field") or "") for e in errors)


def test_modify_view_rejects_malformed_xml():
    op = {"type": "modify_view", "params": {
        "model": "res.partner", "inherit_id": 42,
        "arch": "<data><xpath expr='broken'",
    }}
    errors = _errors(validate_operation(op))
    assert any("XML invalide" in e["message"] for e in errors)


def test_modify_view_accepts_inherit_xmlid():
    op = {"type": "modify_view", "params": {
        "model": "res.partner",
        "inherit_xmlid": "base.view_partner_form",
        "arch": "<data><xpath expr=\"//field[@name='name']\" position='after'/></data>",
    }}
    assert validate_operation(op) == []


# ── modify_report ────────────────────────────────────────────────


def test_modify_report_field_tag_warning():
    op = {"type": "modify_report", "params": {
        "inherit_xmlid": "account.report_invoice_document",
        "arch": "<data><xpath expr='//div' position='inside'><field name='x_y'/></xpath></data>",
    }}
    warnings = _warnings(validate_operation(op))
    assert any("t-field" in w["message"] for w in warnings)


def test_modify_report_with_tfield_is_clean():
    op = {"type": "modify_report", "params": {
        "inherit_xmlid": "account.report_invoice_document",
        "arch": "<data><xpath expr='//div' position='inside'><span t-field='o.x_y'/></xpath></data>",
    }}
    assert validate_operation(op) == []


# ── create_server_action ─────────────────────────────────────────


def test_server_action_code_state_requires_code():
    op = {"type": "create_server_action", "params": {
        "model": "res.partner", "name": "Touche", "state": "code",
    }}
    errors = _errors(validate_operation(op))
    assert any("code" in (e.get("field") or "") for e in errors)


def test_server_action_rejects_invalid_state():
    op = {"type": "create_server_action", "params": {
        "model": "res.partner", "name": "Touche", "state": "weird",
    }}
    errors = _errors(validate_operation(op))
    assert any("state" in (e.get("field") or "") for e in errors)


# ── create_automation ────────────────────────────────────────────


def test_automation_rejects_unknown_trigger():
    op = {"type": "create_automation", "params": {
        "model": "res.partner", "name": "Auto", "trigger": "on_explode",
        "code": "pass",
    }}
    errors = _errors(validate_operation(op))
    assert any("trigger" in (e.get("field") or "") for e in errors)


# ── create_cron ──────────────────────────────────────────────────


def test_cron_requires_positive_interval():
    op = {"type": "create_cron", "params": {
        "model": "res.partner", "name": "Cron", "code": "pass",
        "interval_number": 0, "interval_type": "days",
    }}
    errors = _errors(validate_operation(op))
    assert any("interval_number" in (e.get("field") or "") for e in errors)


def test_cron_rejects_unknown_interval_type():
    op = {"type": "create_cron", "params": {
        "model": "res.partner", "name": "Cron", "code": "pass",
        "interval_number": 1, "interval_type": "seconds",
    }}
    errors = _errors(validate_operation(op))
    assert any("interval_type" in (e.get("field") or "") for e in errors)


# ── Records / transactional guard ────────────────────────────────


@pytest.mark.parametrize("model", [
    "sale.order", "sale.order.line",
    "account.move", "account.move.line", "account.payment",
    "stock.move", "stock.picking",
    "pos.order",
])
def test_transactional_models_blocked_on_update(model):
    op = {"type": "update_record", "params": {
        "model": model,
        "targets": [{"id": 1, "display_name": "X"}],
        "values": {"name": "Y"},
    }}
    errors = _errors(validate_operation(op))
    assert any("transactionnel" in e["message"] for e in errors)


def test_update_record_requires_targets():
    op = {"type": "update_record", "params": {
        "model": "res.partner", "targets": [], "values": {"name": "X"},
    }}
    errors = _errors(validate_operation(op))
    assert any("targets" in (e.get("field") or "") for e in errors)


def test_update_record_rejects_empty_values():
    op = {"type": "update_record", "params": {
        "model": "res.partner",
        "targets": [{"id": 1, "display_name": "X"}], "values": {},
    }}
    errors = _errors(validate_operation(op))
    assert any("values" in (e.get("field") or "") for e in errors)


def test_update_record_warns_on_list_value():
    op = {"type": "update_record", "params": {
        "model": "res.partner",
        "targets": [{"id": 1, "display_name": "X"}],
        "values": {"child_ids": [[6, 0, [1, 2]]]},
    }}
    warnings = _warnings(validate_operation(op))
    assert any("one2many" in w["message"] for w in warnings)


def test_create_record_empty_values_rejected():
    op = {"type": "create_record", "params": {
        "model": "res.partner", "values": {},
    }}
    errors = _errors(validate_operation(op))
    assert any("values" in (e.get("field") or "") for e in errors)


# ── Unknown type ─────────────────────────────────────────────────


def test_unknown_type_returns_error():
    issues = validate_operation({"type": "frobnicate", "params": {}})
    assert _errors(issues)


# ── Changeset aggregate ──────────────────────────────────────────


def test_changeset_ok_only_when_no_errors_at_all():
    clean = validate_changeset([
        {"type": "create_field", "params": {
            "model": "res.partner", "name": "x_note", "ttype": "char"}},
    ])
    assert clean["ok"] is True
    assert len(clean["operations"]) == 1
    assert clean["operations"][0]["issues"] == []


def test_changeset_not_ok_when_any_op_has_an_error():
    aggregate = validate_changeset([
        {"type": "create_field", "params": {
            "model": "res.partner", "name": "x_note", "ttype": "char"}},  # clean
        {"type": "create_field", "params": {
            "model": "res.partner", "name": "bad", "ttype": "char"}},  # error
    ])
    assert aggregate["ok"] is False
    assert aggregate["operations"][0]["issues"] == []
    assert _errors(aggregate["operations"][1]["issues"])


def test_changeset_ok_with_only_warnings():
    """Warnings are advisory — they do not break the pre-flight."""
    aggregate = validate_changeset([
        {"type": "create_field", "params": {
            "model": "res.partner", "name": "x_total", "ttype": "integer",
            "compute": "for record in self:\n    record['x_total'] = 1",
        }},
    ])
    assert aggregate["ok"] is True
    assert _warnings(aggregate["operations"][0]["issues"])


def test_modify_view_deep_xpath_warning():
    """Validator counterpart of the studio_feasibility fix."""
    arch = (
        '<data><xpath expr="//form/sheet/notebook/page[@name=\'other_information\']/group" '
        'position="inside"><field name="x_y"/></xpath></data>'
    )
    op = {"type": "modify_view", "params": {
        "model": "sale.order", "inherit_id": 42, "arch": arch,
    }}
    warnings = _warnings(validate_operation(op))
    assert any("XPath" in w["message"] and "Studio" in w["message"] for w in warnings)


def test_modify_view_simple_xpath_no_warning():
    arch = (
        '<data><xpath expr="//page[@name=\'other_information\']" position="inside">'
        '<field name="x_y"/></xpath></data>'
    )
    op = {"type": "modify_view", "params": {
        "model": "sale.order", "inherit_id": 42, "arch": arch,
    }}
    assert _warnings(validate_operation(op)) == []
