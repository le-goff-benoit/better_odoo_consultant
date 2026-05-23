"""Studio feasibility service — the rules the UI shows the user about
whether each Creator operation could be reproduced in Odoo Studio."""

from odoo_consultant_portal.services.studio_feasibility_service import (
    evaluate_changeset,
    evaluate_operation,
)


def test_simple_field_creation_is_feasible():
    result = evaluate_operation({"type": "create_field", "ttype": "char", "name": "x_note"})
    assert result["verdict"] == "feasible"


def test_reference_field_is_with_caveats():
    result = evaluate_operation({"type": "create_field", "ttype": "reference"})
    assert result["verdict"] == "with_caveats"
    assert any("Reference" in r for r in result["reasons"])


def test_simple_view_xpath_is_feasible():
    op = {"type": "modify_view", "xpath": "//field[@name='partner_id']", "operation": "after"}
    assert evaluate_operation(op)["verdict"] == "feasible"


def test_complex_view_xpath_is_with_caveats():
    op = {"type": "modify_view", "xpath": "//field[@name='line_ids']/tree/field[2]", "operation": "after"}
    result = evaluate_operation(op)
    assert result["verdict"] == "with_caveats"
    assert any("XPath" in r for r in result["reasons"])


def test_replace_position_is_with_caveats():
    op = {"type": "modify_view", "xpath": "//field[@name='partner_id']", "operation": "replace"}
    result = evaluate_operation(op)
    assert result["verdict"] == "with_caveats"
    assert any("replace" in r.lower() for r in result["reasons"])


def test_cron_is_not_feasible():
    result = evaluate_operation({"type": "create_cron"})
    assert result["verdict"] == "not_feasible"
    assert any("planifi" in r for r in result["reasons"])


def test_record_operations_are_not_feasible():
    for op_type in ("create_record", "update_record", "delete_record"):
        assert evaluate_operation({"type": op_type})["verdict"] == "not_feasible"


def test_automation_is_feasible():
    assert evaluate_operation({"type": "create_automation"})["verdict"] == "feasible"


def test_modify_report_is_at_best_with_caveats():
    # Simple xpath on a report still demands the Studio report editor and is
    # not entirely covered — verdict stays "with_caveats".
    op = {"type": "modify_report", "xpath": "//div[@name='footer']"}
    assert evaluate_operation(op)["verdict"] == "with_caveats"


def test_unknown_operation_falls_back_to_caveats_with_message():
    result = evaluate_operation({"type": "frobnicate"})
    assert result["verdict"] == "with_caveats"
    assert any("inconnu" in r.lower() for r in result["reasons"])


def test_changeset_verdict_is_the_worst_per_op():
    ops = [
        {"type": "create_field", "ttype": "char"},          # feasible
        {"type": "modify_view", "xpath": "//field[@name='x']", "operation": "after"},  # feasible
        {"type": "create_cron"},                            # not_feasible
    ]
    aggregate = evaluate_changeset(ops)
    assert aggregate["verdict"] == "not_feasible"
    assert "sort du périmètre" in aggregate["summary"]
    assert len(aggregate["operations"]) == 3
    assert [op["index"] for op in aggregate["operations"]] == [0, 1, 2]


def test_changeset_verdict_is_feasible_when_all_ops_are():
    ops = [
        {"type": "create_field", "ttype": "char"},
        {"type": "modify_view", "xpath": "//field[@name='x']", "operation": "after"},
        {"type": "create_automation"},
    ]
    aggregate = evaluate_changeset(ops)
    assert aggregate["verdict"] == "feasible"
    assert "entièrement réalisable" in aggregate["summary"]


def test_empty_changeset_is_feasible():
    assert evaluate_changeset([])["verdict"] == "feasible"
