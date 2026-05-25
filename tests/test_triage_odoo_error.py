"""Tests for the triage_odoo_error skill handler — deterministic
classification of Odoo error logs / tracebacks across the 5 root-cause
families (migration / studio / data / custom_dev / source_code)."""
from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_handler():
    path = _REPO_ROOT / "skills" / "triage-odoo-error" / "scripts" / "handler.py"
    spec = importlib.util.spec_from_file_location("triage_handler", path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Ctx:
    odoo = None
    source_path = None
    repo_path = None
    target_path = None
    loop = None


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def handler():
    return _load_handler()


def _run(loop, coro):
    return loop.run_until_complete(coro)


# ── Verdict tests ────────────────────────────────────────────────

def test_validation_error_is_data(handler, event_loop):
    log = '''
Traceback (most recent call last):
  File "/odoo/odoo/api.py", line 1234, in __call__
    return self._call(env, *args)
  File "/odoo/addons/account/models/account_move.py", line 1567, in _check_balanced
    raise ValidationError(_("The journal entry is unbalanced."))
odoo.exceptions.ValidationError: ('Le total ne balance pas', None)
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["ok"] is True
    assert out["verdict"] == "data"
    assert out["confidence"] == "high"
    assert out["parsed"]["exception_class"] == "odoo.exceptions.ValidationError"
    assert out["next_steps"]["skill"] == "odoo_query_records"


def test_user_error_is_data_even_in_standard_path(handler, event_loop):
    log = '''
Traceback (most recent call last):
  File "/odoo/addons/sale/models/sale_order.py", line 800, in action_confirm
    raise UserError(_("You cannot confirm an empty order."))
odoo.exceptions.UserError: You cannot confirm an empty order.
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["verdict"] == "data"
    assert "UserError" in out["parsed"]["exception_class"]


def test_postgres_not_null_violation_is_data(handler, event_loop):
    log = '''
Traceback (most recent call last):
  File "/odoo/odoo/sql_db.py", line 700, in execute
    res = self._obj.execute(query, params)
psycopg2.errors.NotNullViolation: null value in column "name" of relation "res_partner" violates not-null constraint
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["verdict"] == "data"
    assert "pg_null_value" in out["signals"]["data"] or "pg_constraint_violation" in out["signals"]["data"]


def test_field_does_not_exist_is_migration(handler, event_loop):
    log = '''
Traceback (most recent call last):
  File "/odoo/odoo/models.py", line 5000, in _fields_get
    raise KeyError(name)
KeyError: 'x_partner_score'
Field 'x_partner_score' does not exist on model 'res.partner'
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["verdict"] == "migration"
    assert out["migration_relevance"] == "high"
    assert out["next_steps"]["skill"] == "compare_odoo_versions"


def test_pg_column_does_not_exist_is_migration(handler, event_loop):
    log = '''
psycopg2.errors.UndefinedColumn: column "x_legacy_status" does not exist
LINE 1: SELECT id, x_legacy_status FROM sale_order WHERE ...
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["verdict"] == "migration"


def test_studio_path_is_studio(handler, event_loop):
    log = '''
Traceback (most recent call last):
  File "/odoo/addons/web_studio/models/ir_model.py", line 120, in _create_studio_field
    self.env['ir.model'].browse(...).create_x_studio_field()
  File "/odoo/addons/web_studio/controllers/main.py", line 80, in create_field
    raise UserError("...")
odoo.exceptions.UserError: ...
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    # web_studio path + UserError: studio takes priority over data because
    # the studio signals are detected before the data branch in the
    # priority order described in the SKILL.md.
    assert out["verdict"] == "studio"
    assert out["next_steps"]["skill"] == "odoo_inspect_studio"


def test_x_studio_field_signal_triggers_studio_verdict(handler, event_loop):
    log = '''
Traceback (most recent call last):
  File "/path/to/some/module.py", line 50, in compute
    return record.x_studio_custom_score * 2
AttributeError: 'res.partner' object has no attribute 'x_studio_custom_score'
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["verdict"] == "studio"
    assert "x_studio_field" in out["signals"]["studio"]


def test_custom_module_path_is_custom_dev(handler, event_loop):
    log = '''
Traceback (most recent call last):
  File "/home/odoo/.odoo-consultant/repos/acme/dev/acme_sales/models/order.py", line 42, in _compute_total
    return sum(self.line_ids.mapped('price_total'))
AttributeError: 'acme.sale' object has no attribute 'line_ids'
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["verdict"] == "custom_dev"
    assert out["next_steps"]["skill"] == "repo_search_code"


def test_pure_standard_traceback_is_source_code(handler, event_loop):
    log = '''
Traceback (most recent call last):
  File "/odoo/odoo/http.py", line 1500, in _serve_db
    response = self._serve_ir_http()
  File "/odoo/odoo/http.py", line 1600, in _serve_ir_http
    return env['ir.http']._dispatch()
  File "/odoo/addons/web/models/ir_http.py", line 80, in _dispatch
    rule.endpoint(**request.params)
TypeError: argument of type 'NoneType' is not iterable
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["verdict"] == "source_code"
    assert out["parsed"]["innermost_layer"] == "standard"


def test_enterprise_path_is_source_code(handler, event_loop):
    log = '''
Traceback (most recent call last):
  File "/enterprise/account_reports/models/account_report.py", line 200, in _get_lines
    return self._compute_grid()
TypeError: 'NoneType' is not subscriptable
'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["verdict"] == "source_code"
    assert out["parsed"]["innermost_layer"] == "enterprise"


def test_empty_input_returns_error(handler, event_loop):
    out = _run(event_loop, handler.run({"text": ""}, _Ctx()))
    assert out["ok"] is False
    assert "missing" in out["error"]


def test_message_only_no_traceback_is_unknown(handler, event_loop):
    out = _run(event_loop, handler.run({"text": "Quelque chose ne marche pas dans Odoo"}, _Ctx()))
    assert out["verdict"] == "unknown"
    assert out["confidence"] == "low"


def test_migration_relevance_high_only_for_migration_verdict(handler, event_loop):
    # ValidationError → data, not migration.
    log = '''File "/odoo/addons/account/models/account_move.py", line 50, in _check
    raise ValidationError("nope")
odoo.exceptions.ValidationError: nope'''
    out = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out["verdict"] == "data"
    assert out["migration_relevance"] in {"low", "medium"}


def test_accepts_log_and_traceback_args(handler, event_loop):
    log = "psycopg2.errors.NotNullViolation: null value in column \"name\""
    out_a = _run(event_loop, handler.run({"log": log}, _Ctx()))
    out_b = _run(event_loop, handler.run({"traceback": log}, _Ctx()))
    out_c = _run(event_loop, handler.run({"text": log}, _Ctx()))
    assert out_a["verdict"] == out_b["verdict"] == out_c["verdict"]
