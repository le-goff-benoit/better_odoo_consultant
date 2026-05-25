"""routing_explain handler — restitue la décision du dispatcher au tour
précédent (candidats scorés, raisons, niveau de confiance)."""
from __future__ import annotations

from typing import Any


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.services.context_service import (
        last_selected_skill_names,
        last_skill_route_candidates,
        last_skill_route_confidence,
    )

    cands = last_skill_route_candidates()
    conf = last_skill_route_confidence()
    selected = last_selected_skill_names()

    if not cands and not selected:
        return {
            "ok": True,
            "markdown": "_Aucune décision de routage récente à expliquer (cache vide ou dispatcher désactivé)._",
            "candidates": [],
            "confidence": {},
            "selected": [],
        }

    lines = []
    lines.append("## Décision de routage — tour précédent\n")
    if conf:
        lvl = conf.get("level", "?")
        top = conf.get("top_score", 0)
        lines.append(f"**Confiance** : `{lvl}` (top score = {top})")
    if selected:
        lines.append("**Skills injectés** : " + ", ".join(f"`{s}`" for s in selected))
    lines.append("")
    lines.append("| Skill | Score | Sélectionné | Raisons |")
    lines.append("|---|---:|:---:|---|")
    for c in cands:
        chk = "✓" if c.get("selected") else "·"
        reason = str(c.get("reason", ""))[:140]
        lines.append(f"| `{c.get('name','?')}` | {c.get('score',0)} | {chk} | {reason} |")
    if any("semantic-fallback" in str(c.get("reason", "")) for c in cands):
        lines.append("")
        lines.append("_Le semantic fallback (TF-IDF cosine) a contribué : aucun signal lexical n'avait dépassé 60._")
    return {
        "ok": True,
        "markdown": "\n".join(lines),
        "candidates": list(cands),
        "confidence": dict(conf),
        "selected": list(selected),
    }
