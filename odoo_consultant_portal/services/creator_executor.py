"""Deterministic executor for Creator changesets.

The AI never writes to Odoo directly. It proposes a structured changeset — a
list of typed operations — which the consultant validates literally. This
module then applies that exact list via XML-RPC, operation by operation,
following Odoo Studio conventions:

- new fields are ``x_``-prefixed and created as ``state=manual``;
- view / report changes go through an INHERITED view (xpath), never in place;
- every created record is registered under an ``x_creator`` pseudo-module in
  ``ir.model.data`` — traceable and removable, exactly like Studio tags its
  own records under ``studio_customization``.

Any partial failure rolls back every record created during the run, so the
target instance is never left in a half-applied state.
"""

import asyncio
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

CREATOR_MODULE = "x_creator"

_RELATIONAL = {"many2one", "one2many", "many2many"}

# Transactional models the Creator must never write records to: sales,
# accounting and the stock / payment flows that feed them. Guarded in the
# executor itself, not just in the prompt — a prompt-only rule is bypassable.
BLOCKED_MODELS = {
    "sale.order", "sale.order.line",
    "account.move", "account.move.line",
    "account.payment",
    "stock.move", "stock.move.line", "stock.picking",
    "stock.valuation.layer",
    "account.bank.statement", "account.bank.statement.line",
    "pos.order", "pos.order.line",
}

# Field types that cannot be snapshotted reliably for a rollback, so the
# Creator refuses to update them (v1). Scalars and many2one are fine.
_NON_REVERSIBLE_TTYPES = {"one2many", "many2many"}

# Operation types accepted in a changeset → executor method name.
HANDLERS = {
    "create_field": "op_create_field",
    "modify_view": "op_modify_view",
    "create_server_action": "op_create_server_action",
    "create_automation": "op_create_automation",
    "create_cron": "op_create_cron",
    "modify_report": "op_modify_report",
    "create_record": "op_create_record",
    "update_record": "op_update_record",
    "delete_record": "op_delete_record",
}


class OperationError(Exception):
    """A changeset operation could not be applied (bad params or Odoo refusal)."""


def _inherited_view_name(parent_name: str | None, fallback: str) -> str:
    """Build a clean, consistent name for a Creator-made inherited view.

    Mirrors how Odoo Studio keeps its customizations identifiable: the name
    reads ``<parent view> (Creator)`` so the inherited view is obvious in the
    Studio / Technical view list. Any existing ``(Creator)`` / ``(Studio)``
    suffix is stripped first so names never stack on repeated inheritance.
    """
    base = (parent_name or "").strip() or (fallback or "").strip()
    base = re.sub(r"\s*\((?:Creator|Studio)\)\s*$", "", base).strip()
    return f"{base} (Creator)" if base else "Personnalisation (Creator)"


async def _run(fn):
    """Run a blocking XML-RPC call off the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn)


def _req(params: dict, key: str) -> Any:
    val = params.get(key)
    if val is None or (isinstance(val, str) and not val.strip()):
        raise OperationError(f"Paramètre obligatoire manquant : '{key}'")
    return val


def _pairs(selection: list) -> list[tuple]:
    """Normalise a selection definition into (value, label) pairs."""
    out: list[tuple] = []
    for item in selection or []:
        if isinstance(item, dict):
            out.append((item.get("value"), item.get("label") or item.get("name")))
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            out.append((item[0], item[1]))
    if not out:
        raise OperationError("Définition 'selection' invalide ou vide.")
    return out


def _validate_xml(arch: str) -> None:
    try:
        ET.fromstring(arch)
    except ET.ParseError as exc:
        raise OperationError(f"Arch XML invalide : {exc}")


def _normalize_xpath(expr: str) -> str:
    expr = (expr or "").strip()
    if expr.startswith("//"):
        return "." + expr
    if expr.startswith("/"):
        return "." + expr
    return expr


def _validate_xpath_targets(parent_arch: str, inherited_arch: str) -> None:
    """Best-effort validation of inherited-view xpath targets.

    Odoo performs the authoritative validation when creating the view. This
    catches common Creator mistakes earlier, especially xpaths pointing to
    fields/pages/groups that are not present in the inspected parent arch.
    Unsupported ElementTree xpath expressions are ignored and left to Odoo.
    """
    try:
        parent_root = ET.fromstring(parent_arch)
        inherited_root = ET.fromstring(inherited_arch)
    except ET.ParseError:
        return
    for node in inherited_root.iter("xpath"):
        expr = node.attrib.get("expr")
        if not expr:
            continue
        try:
            matches = parent_root.findall(_normalize_xpath(expr))
        except (SyntaxError, KeyError):
            continue
        if not matches:
            raise OperationError(f"XPath sans cible dans la vue parente : {expr}")


def _clean(values: dict) -> dict:
    """Drop None values — the XML-RPC marshaller rejects them (allow_none off)."""
    return {k: v for k, v in values.items() if v is not None}


def _guard_model(model: str) -> None:
    """Refuse record writes on transactional models (sales / accounting / stock)."""
    if (model or "").strip() in BLOCKED_MODELS:
        raise OperationError(
            f"Modèle protégé : '{model}'. Le Creator n'écrit pas de records sur "
            "les modèles transactionnels (ventes, comptabilité, stock, paiements).")


def _to_writable(value: Any) -> Any:
    """Normalise a value read from search_read into something ``write`` accepts.

    search_read returns a many2one as a ``[id, display_name]`` pair; ``write``
    expects the bare id. Used when restoring a snapshot during rollback.
    """
    if isinstance(value, (list, tuple)):
        if len(value) == 2 and isinstance(value[0], int):
            return value[0]
        return list(value)
    return value


def _recreate_value(value: Any, ttype: str) -> Any:
    """Normalise a search_read value so it can be passed to ``create``.

    Used to rebuild a deleted record during rollback: many2one pairs become
    bare ids, many2many id-lists become a ``(6, 0, ids)`` command.
    """
    if ttype == "many2one":
        if isinstance(value, (list, tuple)) and value:
            return value[0]
        return value or False
    if ttype == "many2many":
        ids = [v for v in (value or []) if isinstance(v, int)]
        return [(6, 0, ids)]
    return value


def _target_ids(params: dict, op_name: str) -> list[int]:
    """Collect the record ids an op targets from ``targets`` / ``record_ids``."""
    ids: list[int] = []
    for target in (params.get("targets") or []):
        if isinstance(target, dict) and target.get("id") is not None:
            ids.append(int(target["id"]))
        elif isinstance(target, int):
            ids.append(target)
    for rid in (params.get("record_ids") or []):
        ids.append(int(rid))
    ids = sorted(set(ids))
    if not ids:
        raise OperationError(
            f"{op_name} : aucune fiche cible — renseigne 'targets'.")
    return ids


class _Executor:
    def __init__(self, odoo, dry: bool = False, version: str | None = None,
                 tag: bool = True):
        self.odoo = odoo
        self.dry = dry                         # preflight: validate, never write
        self.version = version
        self.tag = tag                         # register created records under x_creator
        self.created: list[dict] = []          # {model, res_id, label} — newest last
        self.modified: list[dict] = []         # {model, res_id, before} — for rollback
        self.deleted: list[dict] = []          # {model, snapshot, label} — for rollback
        self._model_cache: dict[str, int] = {}
        self._dry_counter = 0

    # ── shared helpers ───────────────────────────────────────────

    async def model_id(self, model_name: str) -> int:
        if model_name in self._model_cache:
            return self._model_cache[model_name]
        rows = await _run(lambda: self.odoo.search_read(
            "ir.model", [["model", "=", model_name]], ["id"], limit=1))
        if not rows:
            raise OperationError(f"Modèle Odoo introuvable : '{model_name}'")
        self._model_cache[model_name] = rows[0]["id"]
        return rows[0]["id"]

    async def resolve_xmlid(self, xmlid: str, expected_model: str | None = None) -> int:
        if not xmlid or "." not in xmlid:
            raise OperationError(f"Identifiant XML invalide : '{xmlid}'")
        module, name = xmlid.split(".", 1)
        domain = [["module", "=", module], ["name", "=", name]]
        if expected_model:
            domain.append(["model", "=", expected_model])
        rows = await _run(lambda: self.odoo.search_read(
            "ir.model.data", domain, ["res_id"], limit=1))
        if not rows:
            raise OperationError(f"Référence XML introuvable : '{xmlid}'")
        return rows[0]["res_id"]

    async def _create(self, model: str, values: dict, label: str) -> int:
        # Dry-run: every read above still ran (so targets are validated), but
        # no record is written. A synthetic negative id keeps handlers happy.
        if self.dry:
            self._dry_counter -= 1
            return self._dry_counter
        res_id = await _run(lambda: self.odoo.create(model, _clean(values)))
        self.created.append({"model": model, "res_id": res_id, "label": label})
        # A transient preview run (tag=False) skips the x_creator traceability
        # tag — the record is rolled back immediately, it must leave no trace.
        if self.tag:
            await self._register_xmlid(model, res_id)
        return res_id

    async def _register_xmlid(self, model: str, res_id: int) -> None:
        """Tag the new record under the x_creator pseudo-module — best effort."""
        name = f"creator_{model.replace('.', '_')}_{res_id}"
        try:
            await _run(lambda: self.odoo.create("ir.model.data", {
                "module": CREATOR_MODULE, "name": name,
                "model": model, "res_id": res_id, "noupdate": True,
            }))
        except Exception:
            pass  # traceability tag is non-blocking

    async def rollback(self) -> list[str]:
        """Undo this run: restore updated records, unlink created ones, and
        re-create deleted ones (best-effort — re-created with fresh ids)."""
        errors: list[str] = []
        for rec in reversed(self.modified):
            try:
                before = {k: _to_writable(v) for k, v in rec["before"].items()}
                await _run(lambda r=rec, b=before:
                           self.odoo.write(r["model"], [r["res_id"]], b))
            except Exception as exc:
                errors.append(f"{rec['model']}#{rec['res_id']} (restauration) : {exc}")
        for rec in reversed(self.created):
            try:
                await _run(lambda r=rec: self.odoo.unlink(r["model"], [r["res_id"]]))
            except Exception as exc:
                errors.append(f"{rec['model']}#{rec['res_id']} : {exc}")
        for rec in reversed(self.deleted):
            try:
                await _run(lambda r=rec:
                           self.odoo.create(r["model"], _clean(r["snapshot"])))
            except Exception as exc:
                errors.append(
                    f"{rec['model']} « {rec.get('label')} » (recréation) : {exc}")
        return errors

    async def _resolve_parent_view(self, p: dict, model: str, view_type: str) -> int:
        if p.get("inherit_xmlid"):
            return await self.resolve_xmlid(p["inherit_xmlid"], "ir.ui.view")
        if p.get("inherit_id"):
            return int(p["inherit_id"])
        rows = await _run(lambda: self.odoo.search_read(
            "ir.ui.view",
            [["model", "=", model], ["type", "=", view_type], ["mode", "=", "primary"]],
            ["id"], limit=1, order="priority asc"))
        if not rows:
            raise OperationError(
                f"Aucune vue primaire '{view_type}' trouvée pour le modèle '{model}'.")
        return rows[0]["id"]

    # ── operation handlers ───────────────────────────────────────

    async def op_create_field(self, p: dict) -> dict:
        model = _req(p, "model")
        name = _req(p, "name")
        if not name.startswith("x_"):
            name = "x_" + name
        ttype = _req(p, "ttype")
        values = {
            "name": name,
            "model_id": await self.model_id(model),
            "field_description": p.get("field_description") or p.get("label") or name,
            "ttype": ttype,
            "state": "manual",
        }
        for opt in ("required", "help", "store", "copied", "index", "tracking",
                    "compute", "depends"):
            if p.get(opt) is not None:
                values[opt] = p[opt]
        if ttype in _RELATIONAL:
            relation = p.get("relation")
            if not relation:
                raise OperationError(f"Champ relationnel '{name}' : 'relation' manquant.")
            values["relation"] = relation
            if ttype == "one2many":
                rel_field = p.get("relation_field")
                if not rel_field:
                    raise OperationError(
                        f"Champ one2many '{name}' : 'relation_field' manquant.")
                values["relation_field"] = rel_field
        if ttype == "selection":
            values["selection_ids"] = [
                [0, 0, {"value": str(v), "name": str(lbl), "sequence": (i + 1) * 10}]
                for i, (v, lbl) in enumerate(_pairs(p.get("selection")))
            ]
        existing = await _run(lambda: self.odoo.search_read(
            "ir.model.fields", [["model", "=", model], ["name", "=", name]],
            ["id"], limit=1))
        if existing:
            raise OperationError(
                f"Le champ '{name}' existe déjà sur le modèle '{model}'.")
        field_id = await self._create(
            "ir.model.fields", values, f"Champ {name} sur {model}")
        return {"field": name, "model": model, "field_id": field_id, "ttype": ttype,
                "plan": f"Champ « {name} » de type {ttype} sur le modèle {model}."}

    async def op_modify_view(self, p: dict) -> dict:
        model = _req(p, "model")
        view_type = p.get("view_type") or "form"
        arch = _req(p, "arch")
        _validate_xml(arch)
        try:
            major = int(str(self.version or "").split(".", 1)[0])
        except Exception:
            major = 0
        if major >= 17 and (" attrs=" in arch or " states=" in arch):
            raise OperationError(
                f"Vue incompatible Odoo {self.version} : attrs/states ne sont plus "
                "acceptés en Odoo 17+ ; utiliser invisible/readonly/required avec "
                "expressions natives.")
        inherit_id = await self._resolve_parent_view(p, model, view_type)
        parent_rows = await _run(lambda: self.odoo.search_read(
            "ir.ui.view", [["id", "=", inherit_id]], ["arch_db", "name"], limit=1))
        parent = parent_rows[0] if parent_rows else {}
        if parent.get("arch_db"):
            _validate_xpath_targets(parent["arch_db"], arch)
        view_name = _inherited_view_name(parent.get("name"), f"{model} {view_type}")
        values = {
            "name": view_name,
            "model": model,
            "type": view_type,
            "inherit_id": inherit_id,
            "mode": "extension",
            "priority": int(p.get("priority") or 99),
            "arch": arch,
        }
        view_id = await self._create(
            "ir.ui.view", values, f"Vue héritée {model} ({view_type})")
        return {"view_id": view_id, "model": model, "view_type": view_type,
                "inherit_id": inherit_id, "view_name": view_name,
                "plan": f"Vue {view_type} héritée du modèle {model} "
                        f"« {view_name} » (vue parente #{inherit_id})."}

    async def op_modify_report(self, p: dict) -> dict:
        arch = _req(p, "arch")
        _validate_xml(arch)
        key = p.get("template_key") or p.get("report_name")
        if p.get("inherit_xmlid"):
            inherit_id = await self.resolve_xmlid(p["inherit_xmlid"], "ir.ui.view")
        else:
            if not key:
                raise OperationError(
                    "Rapport : 'inherit_xmlid' ou 'template_key' requis.")
            rows = await _run(lambda: self.odoo.search_read(
                "ir.ui.view", [["key", "=", key], ["type", "=", "qweb"]],
                ["id"], limit=1))
            if not rows:
                raise OperationError(f"Template QWeb introuvable : '{key}'")
            inherit_id = rows[0]["id"]
        parent_rows = await _run(lambda: self.odoo.search_read(
            "ir.ui.view", [["id", "=", inherit_id]], ["name"], limit=1))
        parent_name = parent_rows[0].get("name") if parent_rows else None
        view_name = _inherited_view_name(
            parent_name, f"Rapport {key or p.get('inherit_xmlid') or ''}")
        values = {
            "name": view_name,
            "type": "qweb",
            "inherit_id": inherit_id,
            "mode": "extension",
            "priority": int(p.get("priority") or 99),
            "arch": arch,
        }
        view_id = await self._create("ir.ui.view", values, "Rapport QWeb hérité")
        return {"view_id": view_id, "inherit_id": inherit_id, "view_name": view_name,
                "plan": f"Vue QWeb héritée « {view_name} » "
                        f"(template parent #{inherit_id})."}

    async def op_create_server_action(self, p: dict) -> dict:
        model = _req(p, "model")
        model_id = await self.model_id(model)
        state = p.get("state") or "code"
        values = {
            "name": _req(p, "name"),
            "model_id": model_id,
            "state": state,
        }
        if state == "code":
            values["code"] = p.get("code") or ""
        if p.get("binding"):
            values["binding_model_id"] = model_id
            values["binding_type"] = "action"
        if isinstance(p.get("extra"), dict):
            values.update(p["extra"])
        action_id = await self._create(
            "ir.actions.server", values, f"Action serveur « {values['name']} »")
        return {"action_id": action_id, "model": model, "state": state,
                "plan": f"Action serveur « {values['name']} » (état {state}) "
                        f"sur le modèle {model}."}

    async def op_create_cron(self, p: dict) -> dict:
        model = _req(p, "model")
        values = {
            "name": _req(p, "name"),
            "model_id": await self.model_id(model),
            "state": "code",
            "code": p.get("code") or "",
            "interval_number": int(p.get("interval_number") or 1),
            "interval_type": p.get("interval_type") or "days",
            "active": bool(p.get("active", True)),
            "nextcall": p.get("nextcall")
            or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        }
        if isinstance(p.get("extra"), dict):
            values.update(p["extra"])
        cron_id = await self._create(
            "ir.cron", values, f"Action planifiée « {values['name']} »")
        return {"cron_id": cron_id, "model": model,
                "plan": f"Action planifiée « {values['name']} » sur {model}, "
                        f"toutes les {values['interval_number']} "
                        f"{values['interval_type']}."}

    async def op_create_automation(self, p: dict) -> dict:
        model = _req(p, "model")
        model_id = await self.model_id(model)
        name = _req(p, "name")
        trigger = p.get("trigger") or "on_create"
        values = {
            "name": name,
            "model_id": model_id,
            "trigger": trigger,
            "active": bool(p.get("active", True)),
        }
        if p.get("filter_domain"):
            values["filter_domain"] = p["filter_domain"]
        fields = await _run(lambda: self.odoo.fields_get("base.automation", ["type"]))
        linked_action_id = None
        if "action_server_ids" in fields:
            # Odoo 17+ : the automation references separate server actions.
            action_id = await self._create("ir.actions.server", {
                "name": f"{name} — action",
                "model_id": model_id,
                "state": "code",
                "code": p.get("code") or "",
            }, f"Action serveur de l'automatisation « {name} »")
            values["action_server_ids"] = [[6, 0, [action_id]]]
            linked_action_id = action_id
        else:
            # Odoo 16 : base.automation delegates to ir.actions.server inline.
            values["state"] = "code"
            values["code"] = p.get("code") or ""
        if isinstance(p.get("extra"), dict):
            values.update(p["extra"])
        automation_id = await self._create(
            "base.automation", values, f"Automatisation « {name} »")
        return {"automation_id": automation_id, "model": model, "trigger": trigger,
                "server_action_id": linked_action_id,
                "plan": f"Automatisation « {name} » (déclencheur {trigger}) "
                        f"sur le modèle {model}."}

    # ── record operations (data, not Studio metadata) ────────────

    async def _field_types(self, model: str, names: list[str]) -> dict:
        """Return {field: ttype} for *names*, raising on any unknown field."""
        meta = await _run(lambda: self.odoo.fields_get(model, ["type"]))
        types: dict[str, str] = {}
        for name in names:
            info = meta.get(name)
            if not info:
                raise OperationError(f"Champ inconnu sur '{model}' : '{name}'.")
            types[name] = info.get("type")
        return types

    async def op_create_record(self, p: dict) -> dict:
        model = _req(p, "model")
        _guard_model(model)
        values = p.get("values")
        if not isinstance(values, dict) or not values:
            raise OperationError("create_record : 'values' est manquant ou vide.")
        await self._field_types(model, list(values.keys()))
        label = (p.get("label") or "").strip() or f"Enregistrement {model}"
        res_id = await self._create(model, dict(values), label)
        return {"model": model, "res_id": res_id, "values": values, "label": label,
                "plan": f"Création d'une fiche « {label} » dans le modèle {model}."}

    async def op_update_record(self, p: dict) -> dict:
        model = _req(p, "model")
        _guard_model(model)
        values = p.get("values")
        if not isinstance(values, dict) or not values:
            raise OperationError("update_record : 'values' est manquant ou vide.")

        ids = _target_ids(p, "update_record")
        field_list = list(values.keys())
        types = await self._field_types(model, field_list)
        bad = [f for f, t in types.items() if t in _NON_REVERSIBLE_TTYPES]
        if bad:
            raise OperationError(
                f"Champs non pris en charge en mise à jour : {', '.join(bad)} "
                "(les champs one2many / many2many ne sont pas rollback-safe en v1).")

        rows = await _run(lambda: self.odoo.search_read(
            model, [["id", "in", ids]], field_list + ["display_name"],
            limit=len(ids)))
        found = {r["id"]: r for r in rows}
        missing = [i for i in ids if i not in found]
        if missing:
            raise OperationError(
                f"Fiches introuvables sur '{model}' : {missing}.")

        records = []
        for rid in ids:
            row = found[rid]
            before = {f: row.get(f) for f in field_list}
            if not self.dry:
                self.modified.append(
                    {"model": model, "res_id": rid, "before": before})
            records.append({
                "id": rid,
                "display_name": row.get("display_name") or f"{model}#{rid}",
                "changes": [
                    {"field": f, "before": before[f], "after": values[f]}
                    for f in field_list
                ],
            })

        if not self.dry:
            await _run(lambda: self.odoo.write(model, ids, dict(values)))

        return {"model": model, "records": records, "values": values,
                "plan": f"Mise à jour de {len(ids)} fiche(s) {model} — "
                        f"champs : {', '.join(field_list)}."}

    async def op_delete_record(self, p: dict) -> dict:
        model = _req(p, "model")
        _guard_model(model)
        ids = _target_ids(p, "delete_record")

        meta = await _run(lambda: self.odoo.fields_get(
            model, ["type", "readonly", "store"]))
        # Snapshot only stored, writable, non-one2many fields — enough to
        # re-create the record on rollback without dragging child records.
        snap_fields = [
            f for f, m in meta.items()
            if m.get("store") and not m.get("readonly")
            and m.get("type") != "one2many"
        ]
        rows = await _run(lambda: self.odoo.search_read(
            model, [["id", "in", ids]], snap_fields + ["display_name"],
            limit=len(ids)))
        found = {r["id"]: r for r in rows}
        missing = [i for i in ids if i not in found]
        if missing:
            raise OperationError(
                f"Fiches introuvables sur '{model}' : {missing}.")

        records = []
        for rid in ids:
            row = found[rid]
            label = row.get("display_name") or f"{model}#{rid}"
            if not self.dry:
                snapshot = {
                    f: _recreate_value(row.get(f), meta[f].get("type"))
                    for f in snap_fields
                }
                self.deleted.append(
                    {"model": model, "snapshot": snapshot, "label": label})
            records.append({"id": rid, "display_name": label})

        if not self.dry:
            await _run(lambda: self.odoo.unlink(model, ids))

        return {"model": model, "records": records,
                "plan": f"Suppression de {len(ids)} fiche(s) {model}."}


async def apply_changeset(odoo, operations: list[dict],
                          rollback_on_failure: bool = True,
                          dry_run: bool = False,
                          version: str | None = None) -> dict:
    """Apply (or preflight) a validated changeset, operation by operation.

    With ``dry_run=True`` nothing is written: every target is resolved and
    validated against the live instance and each operation reports the exact
    change it *would* make (its ``plan``). All operations are checked so every
    problem surfaces in a single pass.

    With ``dry_run=False`` the changeset is applied for real; on any failure,
    every record created during the run is rolled back (unless disabled) and
    the previously successful operations are reported as ``rolled_back``.
    """
    executor = _Executor(odoo, dry=dry_run, version=version)
    results: list[dict] = []
    failed = False

    for index, op in enumerate(operations or []):
        op_type = (op.get("type") or "").strip()
        summary = op.get("summary") or op_type
        # Real run: once something failed, skip the rest (rollback undoes it).
        # Dry run: keep validating so every problem surfaces at once.
        if failed and not dry_run:
            results.append({"index": index, "type": op_type, "summary": summary,
                            "status": "skipped"})
            continue
        handler_name = HANDLERS.get(op_type)
        if not handler_name:
            results.append({"index": index, "type": op_type, "summary": summary,
                            "status": "failed",
                            "error": f"Type d'opération inconnu : '{op_type}'"})
            failed = True
            continue
        try:
            detail = await getattr(executor, handler_name)(op.get("params") or {})
            results.append({"index": index, "type": op_type, "summary": summary,
                            "status": "ok" if dry_run else "success",
                            "plan": detail.get("plan"), "detail": detail})
        except Exception as exc:
            results.append({"index": index, "type": op_type, "summary": summary,
                            "status": "failed", "error": str(exc)})
            failed = True

    rolled_back = False
    rollback_errors: list[str] = []
    if (not dry_run and failed and rollback_on_failure
            and (executor.created or executor.modified or executor.deleted)):
        rollback_errors = await executor.rollback()
        rolled_back = True
        for r in results:
            if r["status"] == "success":
                r["status"] = "rolled_back"

    return {
        "ok": not failed,
        "dry_run": dry_run,
        "operations": results,
        "created": executor.created,
        "modified": executor.modified,
        "deleted": executor.deleted,
        "rolled_back": rolled_back,
        "rollback_errors": rollback_errors,
        "applied_at": datetime.utcnow().isoformat(),
    }
