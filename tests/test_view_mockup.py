"""Tests for the view mockup builder in view_service.py."""
import pytest
from backend.services.view_service import _build_mockup

# ── Minimal arch fixtures ────────────────────────────────────────────────────

FORM_ARCH = """
<form>
  <header>
    <button name="action_confirm" string="Confirm" type="object"/>
    <field name="state" widget="statusbar" statusbar_visible="draft,confirmed,done"/>
  </header>
  <sheet>
    <div class="oe_button_box" name="button_box">
      <button class="oe_stat_button" name="action_view_delivery">
        <field name="delivery_count" string="Deliveries"/>
      </button>
    </div>
    <group>
      <group>
        <field name="name"/>
        <field name="partner_id"/>
      </group>
      <group>
        <field name="date_order"/>
        <field name="company_id"/>
      </group>
    </group>
    <notebook>
      <page string="Order Lines" name="order_lines">
        <group>
          <field name="order_line"/>
        </group>
      </page>
      <page string="Other Info" name="other_info">
        <group>
          <field name="note"/>
          <field name="user_id"/>
        </group>
      </page>
    </notebook>
  </sheet>
</form>
"""

LIST_ARCH = """
<list>
  <field name="name"/>
  <field name="partner_id"/>
  <field name="date_order"/>
  <field name="amount_total"/>
  <field name="state"/>
</list>
"""

KANBAN_ARCH = """
<kanban>
  <templates>
    <t t-name="card">
      <field name="name"/>
      <field name="partner_id"/>
      <field name="state"/>
    </t>
  </templates>
</kanban>
"""

FIELDS_META = {
    "name": {"string": "Order Reference", "type": "char"},
    "partner_id": {"string": "Customer", "type": "many2one"},
    "date_order": {"string": "Order Date", "type": "datetime"},
    "amount_total": {"string": "Total", "type": "monetary"},
    "state": {"string": "Status", "type": "selection"},
    "company_id": {"string": "Company", "type": "many2one"},
    "order_line": {"string": "Order Lines", "type": "one2many"},
    "note": {"string": "Notes", "type": "text"},
    "user_id": {"string": "Salesperson", "type": "many2one"},
    "delivery_count": {"string": "Deliveries", "type": "integer"},
}


# ── Form tests ───────────────────────────────────────────────────────────────

def test_form_mockup_type():
    result = _build_mockup(FORM_ARCH, "form", FIELDS_META)
    assert result["type"] == "form"


def test_form_mockup_statusbar():
    result = _build_mockup(FORM_ARCH, "form", FIELDS_META)
    assert result["statusbar"] is not None
    assert result["statusbar"]["name"] == "state"
    assert "draft" in result["statusbar"]["visible"]
    assert "done" in result["statusbar"]["visible"]


def test_form_mockup_header_buttons():
    result = _build_mockup(FORM_ARCH, "form", FIELDS_META)
    labels = [b["label"] for b in result["header_buttons"]]
    assert "Confirm" in labels


def test_form_mockup_smart_buttons():
    result = _build_mockup(FORM_ARCH, "form", FIELDS_META)
    # Smart button label from child field string
    labels = [b["label"] for b in result["smart_buttons"]]
    assert any("Deliveries" in lbl or "Delivery" in lbl for lbl in labels)


def test_form_mockup_groups_have_fields():
    result = _build_mockup(FORM_ARCH, "form", FIELDS_META)
    assert len(result["groups"]) > 0
    all_fields = [f for g in result["groups"] for f in g["fields"]]
    field_names = [f["name"] for f in all_fields]
    assert "name" in field_names
    assert "partner_id" in field_names


def test_form_mockup_field_labels_from_meta():
    result = _build_mockup(FORM_ARCH, "form", FIELDS_META)
    all_fields = [f for g in result["groups"] for f in g["fields"]]
    partner_field = next((f for f in all_fields if f["name"] == "partner_id"), None)
    assert partner_field is not None
    assert partner_field["label"] == "Customer"


def test_form_mockup_notebook_pages():
    result = _build_mockup(FORM_ARCH, "form", FIELDS_META)
    pages = result["pages"]
    assert len(pages) == 2
    page_names = [p["name"] for p in pages]
    assert "Order Lines" in page_names
    assert "Other Info" in page_names


def test_form_mockup_notebook_page_has_fields():
    result = _build_mockup(FORM_ARCH, "form", FIELDS_META)
    other_info = next(p for p in result["pages"] if p["name"] == "Other Info")
    all_fields = [f for g in other_info["groups"] for f in g["fields"]]
    field_names = [f["name"] for f in all_fields]
    assert "user_id" in field_names


# ── List tests ───────────────────────────────────────────────────────────────

def test_list_mockup_type():
    result = _build_mockup(LIST_ARCH, "list", FIELDS_META)
    assert result["type"] == "list"


def test_list_mockup_columns():
    result = _build_mockup(LIST_ARCH, "list", FIELDS_META)
    cols = result["columns"]
    assert len(cols) == 5
    col_names = [c["name"] for c in cols]
    assert "name" in col_names
    assert "amount_total" in col_names


def test_list_mockup_column_labels():
    result = _build_mockup(LIST_ARCH, "list", FIELDS_META)
    col_map = {c["name"]: c["label"] for c in result["columns"]}
    assert col_map["partner_id"] == "Customer"
    assert col_map["date_order"] == "Order Date"


def test_list_mockup_tree_alias():
    """'tree' view type should produce the same result as 'list'."""
    list_result = _build_mockup(LIST_ARCH, "list", FIELDS_META)
    tree_result = _build_mockup(LIST_ARCH, "tree", FIELDS_META)
    assert list_result["type"] == tree_result["type"] == "list"
    assert len(list_result["columns"]) == len(tree_result["columns"])


# ── Kanban tests ─────────────────────────────────────────────────────────────

def test_kanban_mockup_type():
    result = _build_mockup(KANBAN_ARCH, "kanban", FIELDS_META)
    assert result["type"] == "kanban"


def test_kanban_mockup_fields():
    result = _build_mockup(KANBAN_ARCH, "kanban", FIELDS_META)
    field_names = [f["name"] for f in result["fields"]]
    assert "name" in field_names
    assert "partner_id" in field_names


# ── Edge cases ────────────────────────────────────────────────────────────────

def test_invalid_arch_returns_empty():
    result = _build_mockup("not valid xml", "form", {})
    assert result == {}


def test_unknown_view_type_returns_empty():
    result = _build_mockup(FORM_ARCH, "pivot", FIELDS_META)
    assert result == {}


def test_empty_fields_meta_falls_back_to_prettified_name():
    result = _build_mockup(LIST_ARCH, "list", {})
    col_map = {c["name"]: c["label"] for c in result["columns"]}
    # Without meta, label should be prettified field name
    assert col_map["partner_id"] == "Partner Id"
    assert col_map["date_order"] == "Date Order"


def test_invisible_fields_excluded():
    arch = """
    <form>
      <sheet>
        <group>
          <field name="visible_field"/>
          <field name="hidden_field" invisible="1"/>
        </group>
      </sheet>
    </form>
    """
    result = _build_mockup(arch, "form", {})
    all_fields = [f for g in result["groups"] for f in g["fields"]]
    field_names = [f["name"] for f in all_fields]
    assert "visible_field" in field_names
    assert "hidden_field" not in field_names
