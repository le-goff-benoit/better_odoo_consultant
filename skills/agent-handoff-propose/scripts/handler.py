"""agent_handoff_propose handler — propose un changement d'agent.

Sortie volontairement déclarative : retourne une suggestion structurée
et un markdown ; ne modifie jamais la perspective serveur.
"""
from __future__ import annotations

from typing import Any


_FR_PHRASES = {
    ("business_analyst", "architect"): "Le cadrage fonctionnel est posé. Tu veux que je passe à l'**architecte** pour la solution technique ?",
    ("architect", "developer"): "L'architecture est claire. Je bascule en **développeur** pour produire le code ?",
    ("support", "business_analyst"): "L'incident est stabilisé. On bascule en **analyste métier** pour traiter la cause racine ?",
    ("developer", "architect"): "Avant d'aller plus loin dans le code, je passe en **architecte** pour valider la trajectoire ?",
    ("business_analyst", "developer"): "Cadrage OK. Tu veux que je passe directement en **développeur** ?",
}

_EN_PHRASES = {
    ("business_analyst", "architect"): "Functional scoping is wrapped up. Want me to switch to the **architect** for the technical solution?",
    ("architect", "developer"): "Architecture is clear. Should I switch to **developer** to produce the code?",
    ("support", "business_analyst"): "The incident is stable. Switch to **business analyst** to address the root cause?",
    ("developer", "architect"): "Before going deeper into code, should I switch to **architect** to validate the trajectory?",
    ("business_analyst", "developer"): "Scoping done. Want me to jump straight to **developer**?",
}


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    src = (args.get("from") or args.get("current") or "").strip()
    dst = (args.get("to") or args.get("target") or "").strip()
    reason = str(args.get("reason") or "").strip() or "Phase boundary detected."
    lang = (args.get("lang") or "fr").lower()
    if lang not in {"fr", "en"}:
        lang = "fr"

    if not dst:
        return {"ok": False, "error": "missing target agent ('to')"}

    try:
        from backend.agents import get_agent, list_agents
    except Exception as exc:  # pragma: no cover
        return {"ok": False, "error": f"agent registry unavailable: {exc}"}

    target = get_agent(dst)
    if target is None:
        available = [a.name for a in list_agents()]
        return {"ok": False, "error": f"unknown target agent '{dst}'", "available": available}

    src_def = get_agent(src) if src else None
    if src_def and src_def.handoff_can_handoff_to:
        if target.name not in src_def.handoff_can_handoff_to:
            return {
                "ok": False,
                "error": f"agent '{src_def.name}' is not allowed to handoff to '{target.name}'",
                "allowed_targets": list(src_def.handoff_can_handoff_to),
            }

    canonical = target.name
    src_name = src_def.name if src_def else (src or "?")
    phrases = _EN_PHRASES if lang == "en" else _FR_PHRASES
    label = target.label_en if lang == "en" else target.label
    phrase = phrases.get((src_name, canonical))
    if not phrase:
        if lang == "en":
            phrase = f"This step looks like it belongs to the **{label}** agent. Want me to switch?"
        else:
            phrase = f"Cette étape relève plutôt de l'agent **{label}**. Tu veux que je bascule ?"

    suggestion = {
        "from": src_name,
        "to": canonical,
        "to_label": label,
        "reason": reason,
    }
    return {
        "ok": True,
        "markdown": phrase,
        "handoff": suggestion,
    }
