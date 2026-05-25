"""routing_self_audit handler — audit qualité du routage sur les derniers
tours loggés."""
from __future__ import annotations

import datetime as _dt
from typing import Any


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    limit = int(args.get("limit") or 500)
    limit = max(20, min(limit, 5000))

    from backend.services import routing_feedback as _rfb

    entries = _rfb.read_recent(limit=limit)
    agg = _rfb.aggregate(limit=limit)

    if not entries:
        return {
            "ok": True,
            "markdown": "_Aucune entrée dans le log de routage_ (`~/.odoo-consultant/routing-feedback.jsonl`).",
            "summary": agg,
        }

    first_ts = entries[0].get("ts")
    last_ts = entries[-1].get("ts")
    period = ""
    try:
        if first_ts and last_ts:
            f = _dt.datetime.fromtimestamp(float(first_ts)).strftime("%Y-%m-%d %H:%M")
            l = _dt.datetime.fromtimestamp(float(last_ts)).strftime("%Y-%m-%d %H:%M")
            period = f"{f} → {l}"
    except Exception:
        period = ""

    lines = ["## Audit du routage IA — agrégé local\n"]
    lines.append(f"**Entrées analysées** : {agg['count']}")
    if period:
        lines.append(f"**Période** : {period}")
    lines.append(f"**Taux de confiance basse** : {agg['low_confidence_rate'] * 100:.1f} %")
    lines.append(f"**Taux de reformulation** : {agg['reformulation_rate'] * 100:.1f} %")
    lines.append("")
    if agg["agents"]:
        lines.append("### Répartition par agent")
        for ag, n in sorted(agg["agents"].items(), key=lambda kv: (-kv[1], kv[0])):
            lines.append(f"- `{ag}` — {n}")
        lines.append("")
    if agg["top_reformulated_skills"]:
        lines.append("### Top skills présents dans des tours reformulés")
        for name, n in agg["top_reformulated_skills"]:
            lines.append(f"- `{name}` — {n} tour(s) reformulé(s)")
        lines.append("")
    else:
        lines.append("_Aucun skill identifié dans des reformulations sur cette fenêtre._\n")

    lines.append("### Pistes")
    if agg["reformulation_rate"] > 0.1:
        lines.append("- Taux de reformulation > 10 % : revoir les keywords des skills cités ci-dessus.")
    if agg["low_confidence_rate"] > 0.25:
        lines.append("- Beaucoup de tours en confiance basse : envisager d'enrichir les `auto_keywords` des agents ou les `keywords` des skills concernés.")
    if not agg["top_reformulated_skills"] and agg["count"] >= 50:
        lines.append("- Routage globalement stable sur cette fenêtre.")

    return {
        "ok": True,
        "markdown": "\n".join(lines),
        "summary": agg,
    }
