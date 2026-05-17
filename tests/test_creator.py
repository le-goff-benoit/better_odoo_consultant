"""Tests for the Creator tool: changeset parsing, executor, dry-run."""

from odoo_consultant_portal.services.creator_service import (
    parse_analysis, build_analysis_message,
)
from odoo_consultant_portal.services.creator_executor import apply_changeset


# ── Changeset parsing ────────────────────────────────────────────

def test_parse_analysis_fenced_json():
    text = (
        "Voici le résultat :\n```json\n"
        '{"functional_analysis":"FA","technical_analysis":"TA",'
        '"operations":[{"type":"create_field","summary":"ajoute x_foo",'
        '"params":{"model":"sale.order","name":"x_foo","ttype":"char"}}]}'
        "\n```"
    )
    result = parse_analysis(text)
    assert result["ok"]
    assert result["functional_analysis"] == "FA"
    assert len(result["operations"]) == 1
    assert result["operations"][0]["type"] == "create_field"


def test_parse_analysis_bare_object():
    result = parse_analysis('{"functional_analysis":"x","operations":[]}')
    assert result["ok"]
    assert result["operations"] == []


def test_parse_analysis_rejects_unknown_op_type():
    result = parse_analysis('{"operations":[{"type":"drop_table","params":{}}]}')
    assert not result["ok"]
    assert "drop_table" in result["error"]


def test_parse_analysis_rejects_non_json():
    result = parse_analysis("Désolé, je ne peux pas faire ça.")
    assert not result["ok"]


def test_build_analysis_message_includes_instructions():
    msg = build_analysis_message("Ajouter un onglet", ["le rendre rouge"])
    assert "Ajouter un onglet" in msg
    assert "le rendre rouge" in msg
    assert "Instructions complémentaires" in msg


# ── Executor ─────────────────────────────────────────────────────

class FakeOdoo:
    """Minimal XML-RPC client stand-in for executor tests."""

    def __init__(self, models=None, automation_fields=None, existing_fields=None,
                 records=None, field_types=None):
        self._next_id = 100
        self.created: list[tuple] = []
        self.unlinked: list[tuple] = []
        self.written: list[tuple] = []
        self._models = models if models is not None else {"sale.order": 1}
        self._automation_fields = automation_fields or {
            "name": {}, "trigger": {}, "state": {}, "code": {}}
        # set of (model, field_name) already present on the instance
        self._existing_fields = set(existing_fields or ())
        # {model: [row dicts]} — ordinary records the executor can read/update
        self._records = records or {}
        # {model: {field: ttype}} — field metadata for record operations
        self._field_types = field_types or {}

    def search_read(self, model, domain=None, fields=None, limit=80,
                    offset=0, order=""):
        if model == "ir.model":
            target = domain[0][2]
            mid = self._models.get(target)
            return [{"id": mid}] if mid else []
        if model == "ir.ui.view":
            return [{"id": 500}]
        if model == "ir.model.fields":
            crit = {d[0]: d[2] for d in (domain or [])}
            key = (crit.get("model"), crit.get("name"))
            return [{"id": 9}] if key in self._existing_fields else []
        if model in self._records:
            rows = self._records[model]
            for d in (domain or []):
                if d[0] == "id" and d[1] == "in":
                    wanted = set(d[2])
                    rows = [r for r in rows if r.get("id") in wanted]
            return [dict(r) for r in rows]
        return []

    def create(self, model, values):
        self._next_id += 1
        self.created.append((model, values, self._next_id))
        return self._next_id

    def unlink(self, model, ids):
        self.unlinked.append((model, ids))
        return True

    def write(self, model, ids, values):
        self.written.append((model, list(ids), dict(values)))
        return True

    def fields_get(self, model, attributes=None):
        if model in self._field_types:
            return {f: {"type": t, "string": f, "store": True, "readonly": False}
                    for f, t in self._field_types[model].items()}
        return self._automation_fields


async def test_apply_create_field_enforces_x_prefix():
    fake = FakeOdoo()
    ops = [{
        "type": "create_field",
        "summary": "ajoute un champ",
        "params": {"model": "sale.order", "name": "foo", "ttype": "char"},
    }]
    result = await apply_changeset(fake, ops)
    assert result["ok"]
    assert result["operations"][0]["status"] == "success"
    field_creates = [c for c in fake.created if c[0] == "ir.model.fields"]
    assert len(field_creates) == 1
    assert field_creates[0][1]["name"] == "x_foo"
    assert field_creates[0][1]["state"] == "manual"


async def test_apply_unknown_operation_type_fails():
    fake = FakeOdoo()
    result = await apply_changeset(fake, [{"type": "nuke", "params": {}}])
    assert not result["ok"]
    assert result["operations"][0]["status"] == "failed"


async def test_apply_rolls_back_on_partial_failure():
    fake = FakeOdoo()
    ops = [
        {"type": "create_field", "summary": "ok",
         "params": {"model": "sale.order", "name": "x_a", "ttype": "char"}},
        {"type": "create_field", "summary": "ko",
         "params": {"model": "ghost.model", "name": "x_b", "ttype": "char"}},
    ]
    result = await apply_changeset(fake, ops)
    assert not result["ok"]
    assert result["rolled_back"]
    assert result["operations"][0]["status"] == "rolled_back"
    assert result["operations"][1]["status"] == "failed"
    # the field created by the first op must have been unlinked
    assert any(m == "ir.model.fields" for m, _ids in fake.unlinked)


async def test_apply_modify_view_creates_inherited_view():
    fake = FakeOdoo()
    ops = [{
        "type": "modify_view",
        "summary": "ajoute un champ à la vue",
        "params": {
            "model": "sale.order", "view_type": "form",
            "arch": '<data><xpath expr="//field[@name=\'name\']" '
                    'position="after"><field name="x_foo"/></xpath></data>',
        },
    }]
    result = await apply_changeset(fake, ops)
    assert result["ok"]
    view_creates = [c for c in fake.created if c[0] == "ir.ui.view"]
    assert len(view_creates) == 1
    assert view_creates[0][1]["mode"] == "extension"
    assert view_creates[0][1]["inherit_id"] == 500


async def test_apply_modify_view_rejects_invalid_xml():
    fake = FakeOdoo()
    ops = [{
        "type": "modify_view", "summary": "xml cassé",
        "params": {"model": "sale.order", "arch": "<data><xpath></data>"},
    }]
    result = await apply_changeset(fake, ops)
    assert not result["ok"]
    assert "XML" in (result["operations"][0].get("error") or "")


# ── Dry-run / preflight ──────────────────────────────────────────

async def test_dry_run_validates_without_writing():
    fake = FakeOdoo()
    ops = [{
        "type": "create_field", "summary": "champ",
        "params": {"model": "sale.order", "name": "x_foo", "ttype": "char"},
    }]
    result = await apply_changeset(fake, ops, dry_run=True)
    assert result["ok"]
    assert result["dry_run"]
    assert result["operations"][0]["status"] == "ok"
    assert result["operations"][0]["plan"]
    # nothing was written to the instance
    assert fake.created == []


async def test_dry_run_reports_every_error_in_one_pass():
    fake = FakeOdoo()
    ops = [
        {"type": "create_field", "summary": "ko1",
         "params": {"model": "ghost.a", "name": "x_a", "ttype": "char"}},
        {"type": "create_field", "summary": "ko2",
         "params": {"model": "ghost.b", "name": "x_b", "ttype": "char"}},
    ]
    result = await apply_changeset(fake, ops, dry_run=True)
    assert not result["ok"]
    # both must be reported as failed — none skipped
    assert [o["status"] for o in result["operations"]] == ["failed", "failed"]


async def test_create_field_rejects_duplicate():
    fake = FakeOdoo(existing_fields=[("sale.order", "x_foo")])
    ops = [{
        "type": "create_field", "summary": "doublon",
        "params": {"model": "sale.order", "name": "x_foo", "ttype": "char"},
    }]
    result = await apply_changeset(fake, ops, dry_run=True)
    assert not result["ok"]
    assert "existe déjà" in (result["operations"][0].get("error") or "")


# ── Record operations ────────────────────────────────────────────

def test_parse_analysis_accepts_record_ops():
    text = (
        '{"functional_analysis":"FA","operations":['
        '{"type":"create_record","summary":"crée un contact",'
        '"params":{"model":"res.partner","values":{"name":"ACME"}}},'
        '{"type":"update_record","summary":"maj produit",'
        '"params":{"model":"product.template","targets":[{"id":5}],'
        '"values":{"list_price":42}}}]}'
    )
    result = parse_analysis(text)
    assert result["ok"]
    assert [o["type"] for o in result["operations"]] == ["create_record", "update_record"]


async def test_apply_create_record():
    fake = FakeOdoo(field_types={"res.partner": {"name": "char"}})
    ops = [{
        "type": "create_record", "summary": "nouveau contact",
        "params": {"model": "res.partner", "values": {"name": "New Co"},
                   "label": "New Co"},
    }]
    result = await apply_changeset(fake, ops)
    assert result["ok"]
    partner_creates = [c for c in fake.created if c[0] == "res.partner"]
    assert len(partner_creates) == 1
    assert partner_creates[0][1]["name"] == "New Co"


async def test_apply_update_record_writes():
    fake = FakeOdoo(
        records={"res.partner": [
            {"id": 7, "name": "ACME", "email": "old@x.com", "display_name": "ACME"}]},
        field_types={"res.partner": {"name": "char", "email": "char"}})
    ops = [{
        "type": "update_record", "summary": "maj email",
        "params": {"model": "res.partner",
                   "targets": [{"id": 7, "display_name": "ACME"}],
                   "values": {"email": "new@x.com"}},
    }]
    result = await apply_changeset(fake, ops)
    assert result["ok"]
    assert ("res.partner", [7], {"email": "new@x.com"}) in fake.written
    detail = result["operations"][0]["detail"]
    change = detail["records"][0]["changes"][0]
    assert change["before"] == "old@x.com"
    assert change["after"] == "new@x.com"


async def test_update_record_refuses_blocked_model():
    fake = FakeOdoo()
    ops = [{
        "type": "update_record", "summary": "maj commande",
        "params": {"model": "sale.order", "targets": [{"id": 1}],
                   "values": {"note": "x"}},
    }]
    result = await apply_changeset(fake, ops, dry_run=True)
    assert not result["ok"]
    assert "protégé" in (result["operations"][0].get("error") or "")
    assert fake.written == []


async def test_update_record_rejects_many2many_field():
    fake = FakeOdoo(
        records={"res.partner": [{"id": 7, "display_name": "ACME"}]},
        field_types={"res.partner": {"category_id": "many2many"}})
    ops = [{
        "type": "update_record", "summary": "maj tags",
        "params": {"model": "res.partner", "targets": [{"id": 7}],
                   "values": {"category_id": [[6, 0, [1]]]}},
    }]
    result = await apply_changeset(fake, ops, dry_run=True)
    assert not result["ok"]
    assert "many2many" in (result["operations"][0].get("error") or "")


async def test_update_record_rolls_back_on_later_failure():
    fake = FakeOdoo(
        records={"res.partner": [
            {"id": 7, "name": "ACME", "display_name": "ACME"}]},
        field_types={"res.partner": {"name": "char"}})
    ops = [
        {"type": "update_record", "summary": "maj nom",
         "params": {"model": "res.partner", "targets": [{"id": 7}],
                    "values": {"name": "Renamed"}}},
        {"type": "create_field", "summary": "ko",
         "params": {"model": "ghost.model", "name": "x_b", "ttype": "char"}},
    ]
    result = await apply_changeset(fake, ops)
    assert not result["ok"]
    assert result["rolled_back"]
    assert result["operations"][0]["status"] == "rolled_back"
    # the update was applied, then the snapshot ("ACME") was restored
    assert fake.written[-1] == ("res.partner", [7], {"name": "ACME"})


def test_parse_analysis_accepts_delete_record():
    text = (
        '{"operations":[{"type":"delete_record","summary":"retire une ligne",'
        '"params":{"model":"product.supplierinfo","targets":[{"id":50}]}}]}'
    )
    result = parse_analysis(text)
    assert result["ok"]
    assert result["operations"][0]["type"] == "delete_record"


async def test_apply_delete_record():
    fake = FakeOdoo(
        records={"product.supplierinfo": [
            {"id": 50, "partner_id": [4921, "Duo"], "price": 10.0,
             "display_name": "Duo — P"}]},
        field_types={"product.supplierinfo": {
            "partner_id": "many2one", "price": "float"}})
    ops = [{
        "type": "delete_record", "summary": "supprime une ligne fournisseur",
        "params": {"model": "product.supplierinfo",
                   "targets": [{"id": 50, "display_name": "Duo — P"}]},
    }]
    result = await apply_changeset(fake, ops)
    assert result["ok"]
    assert ("product.supplierinfo", [50]) in fake.unlinked


async def test_delete_record_refuses_blocked_model():
    fake = FakeOdoo()
    ops = [{
        "type": "delete_record", "summary": "supprime une écriture",
        "params": {"model": "account.move", "targets": [{"id": 1}]},
    }]
    result = await apply_changeset(fake, ops, dry_run=True)
    assert not result["ok"]
    assert "protégé" in (result["operations"][0].get("error") or "")
    assert fake.unlinked == []


async def test_delete_record_recreates_on_rollback():
    fake = FakeOdoo(
        records={"product.supplierinfo": [
            {"id": 50, "partner_id": [4921, "Duo"], "price": 10.0,
             "display_name": "Duo — P"}]},
        field_types={"product.supplierinfo": {
            "partner_id": "many2one", "price": "float"}})
    ops = [
        {"type": "delete_record", "summary": "supprime une ligne",
         "params": {"model": "product.supplierinfo", "targets": [{"id": 50}]}},
        {"type": "create_field", "summary": "ko",
         "params": {"model": "ghost.model", "name": "x_b", "ttype": "char"}},
    ]
    result = await apply_changeset(fake, ops)
    assert not result["ok"]
    assert result["rolled_back"]
    assert result["operations"][0]["status"] == "rolled_back"
    # the deleted supplierinfo line was re-created from its snapshot
    recreated = [c for c in fake.created if c[0] == "product.supplierinfo"]
    assert len(recreated) == 1
    assert recreated[0][1]["partner_id"] == 4921


# ── Route wiring ─────────────────────────────────────────────────

async def test_route_projects_empty(client):
    resp = await client.get("/api/creator/projects")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_route_apply_rejects_empty_changeset(client):
    resp = await client.post("/api/creator/apply", json={
        "profile_id": 1, "request": "x", "operations": [],
    })
    assert resp.status_code == 400
