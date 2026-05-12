import xmlrpc.client
import csv
import io
from typing import Any, Optional
from datetime import datetime

try:
    import openpyxl
    _OPENPYXL = True
except ImportError:
    _OPENPYXL = False


class OdooClient:
    def __init__(self, url: str, db: str, login: str, api_key: str):
        self.url = url.rstrip("/")
        self.db = db
        self.login = login
        self.api_key = api_key
        self._uid: Optional[int] = None
        self._common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
        self._models = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object")

    def authenticate(self) -> int:
        self._uid = self._common.authenticate(self.db, self.login, self.api_key, {})
        if not self._uid:
            raise ValueError("Authentication failed")
        return self._uid

    @property
    def uid(self) -> int:
        if self._uid is None:
            self.authenticate()
        return self._uid

    def search_read(
        self,
        model: str,
        domain: list = None,
        fields: list[str] = None,
        limit: int = 80,
        offset: int = 0,
        order: str = "",
    ) -> list[dict]:
        domain = domain or []
        kwargs: dict[str, Any] = {"limit": limit, "offset": offset}
        if fields:
            kwargs["fields"] = fields
        if order:
            kwargs["order"] = order
        return self._models.execute_kw(
            self.db, self.uid, self.api_key, model, "search_read", [domain], kwargs
        )

    def fields_get(self, model: str, attributes: list[str] = None) -> dict:
        attrs = attributes or ["string", "type", "help", "required", "readonly"]
        return self._models.execute_kw(
            self.db, self.uid, self.api_key, model, "fields_get", [], {"attributes": attrs}
        )

    def search_count(self, model: str, domain: list = None) -> int:
        return self._models.execute_kw(
            self.db, self.uid, self.api_key, model, "search_count", [domain or []]
        )

    def get_installed_modules(self) -> list[dict]:
        return self.search_read(
            "ir.module.module",
            [["state", "=", "installed"]],
            ["name", "shortdesc", "author", "installed_version"],
            limit=500,
        )

    def get_installed_apps(self) -> list[dict]:
        return self.search_read(
            "ir.module.module",
            [["state", "=", "installed"], ["application", "=", True]],
            ["name", "shortdesc", "category_id"],
            limit=200,
        )

    def export_markdown(self, records: list[dict]) -> str:
        if not records:
            return "_No results._"
        headers = list(records[0].keys())
        rows = [[str(r.get(h, "")) for h in headers] for r in records]
        col_widths = [max(len(h), max((len(row[i]) for row in rows), default=0)) for i, h in enumerate(headers)]
        sep = "| " + " | ".join("-" * w for w in col_widths) + " |"
        header_row = "| " + " | ".join(h.ljust(col_widths[i]) for i, h in enumerate(headers)) + " |"
        data_rows = ["| " + " | ".join(v.ljust(col_widths[i]) for i, v in enumerate(row)) + " |" for row in rows]
        return "\n".join([header_row, sep] + data_rows)

    def export_csv(self, records: list[dict]) -> str:
        if not records:
            return ""
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)
        return buf.getvalue()

    def export_excel(self, records: list[dict], path: str) -> str:
        if not _OPENPYXL:
            raise ImportError("openpyxl not installed")
        wb = openpyxl.Workbook()
        ws = wb.active
        if records:
            headers = list(records[0].keys())
            ws.append(headers)
            for r in records:
                ws.append([r.get(h, "") for h in headers])
        wb.save(path)
        return path
