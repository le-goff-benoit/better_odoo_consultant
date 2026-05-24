"""inspect_installed_modules handler — list installed Odoo modules."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    filter_text = (args.get("filter") or "").casefold().strip()
    apps_only = bool(args.get("apps_only") or False)
    try:
        limit = max(1, min(int(args.get("limit") or 300), 1000))
    except (TypeError, ValueError):
        limit = 300
    domain = [["state", "=", "installed"]]
    if apps_only:
        domain.append(["application", "=", True])
    modules = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.search_read(
        "ir.module.module",
        domain,
        ["name", "shortdesc", "author", "installed_version", "application", "category_id"],
        limit=limit,
        order="application desc, name asc",
    ))
    if filter_text:
        modules = [
            m for m in modules
            if filter_text in " ".join(str(m.get(k) or "") for k in ("name", "shortdesc", "author", "category_id")).casefold()
        ]
    custom_markers = ("custom", "odoo sh", "odoo.sh", "studio", "client")
    for module in modules:
        author = str(module.get("author") or "").casefold()
        name = str(module.get("name") or "")
        module["likely_custom"] = bool(name.startswith("x_") or any(marker in author for marker in custom_markers))
    apps = [m for m in modules if m.get("application")]
    return {
        "ok": True,
        "count": len(modules),
        "applications_count": len(apps),
        "likely_custom_count": sum(1 for m in modules if m.get("likely_custom")),
        "modules": modules,
    }
