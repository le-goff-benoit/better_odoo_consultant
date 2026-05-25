"""Guard: skills core marqués ``allow_implicit_invocation: false`` ne doivent
JAMAIS être sélectionnés implicitement par le dispatcher, même sur des prompts
contenant accidentellement un mot-clé du skill.

C'est l'invariant qui protège les orchestrateurs runtime (perspective router,
context aggregator, skill dispatcher, complexity/localization/release-notes
analyzers, report writer) d'apparaître dans la liste des skills utilisables
comme un outil métier.
"""

from __future__ import annotations

import pytest

from backend.services.context_service import _select_skill_playbooks
from backend.skills.registry import SKILL_DEFINITIONS


# Les orchestrateurs runtime cœur : ils ne doivent JAMAIS être routés
# implicitement par mot-clé. ``output_report_writer`` est volontairement
# exclu : il porte aussi ``allow_implicit_invocation: false`` mais son
# entrée est légitime via la sélection de template (raison
# ``template:<name>``), ce qui compte comme une invocation explicite.
_PROTECTED_CORE = tuple(
    s.name for s in SKILL_DEFINITIONS
    if s.kind == "core"
    and not s.allow_implicit_invocation
    and s.name.startswith("runtime_")
)


_PROMPTS = [
    # Prompts génériques sans intent métier précis
    "Quel temps fait-il aujourd'hui ?",
    "Bonjour, peux-tu m'aider ?",
    "What's the weather today?",
    "Hello, can you help me?",
    # Prompts qui contiennent des mots des keywords des core skills,
    # pour vérifier qu'ils ne déclenchent quand même pas
    "Je dois choisir un profil de réponse pour mon équipe.",
    "Mon projet est complexe avec beaucoup de Studio.",
    "Quelle est la complexité de ce dossier ?",
    "Le contexte du projet est mal défini.",
    "Peux-tu m'aider à dispatcher cette tâche ?",
    "Quels sont les release notes de la version 18 ?",
    "Le code de localisation française est FR.",
    "Architect overview of the system.",
    "Je veux un support pour ce client.",
    "Could you provide a developer perspective?",
    "Rédige un email rapide au client.",
    "Write a short summary please.",
    "Quel est l'objectif de ce sprint ?",
    "Donne-moi un avis sur l'architecture du système.",
    # Prompts touchant l'Odoo standard (doivent router vers skills métier,
    # pas vers les orchestrateurs)
    "Liste-moi les factures impayées.",
    "Compte combien de commandes sont en cours.",
    "Quels sont les champs du modèle res.partner ?",
    "Montre-moi la vue form de sale.order.",
    "Quelles règles de sécurité protègent account.move ?",
    "Cherche QWeb dans les sources Odoo.",
    "Quel est le menu pour accéder aux produits ?",
    "Inspecte le rapport facture PDF.",
    "Audit Studio du projet.",
    "Combien de modules custom dans le repo client ?",
]


@pytest.mark.parametrize("prompt", _PROMPTS, ids=lambda p: p[:40])
def test_protected_core_skills_never_invoked_implicitly(prompt: str) -> None:
    """Aucun core skill protégé ne doit apparaître dans ``_last_matched``
    pour un prompt utilisateur arbitraire (pas d'invocation explicite)."""
    if not _PROTECTED_CORE:
        pytest.skip("Aucun core skill protégé déclaré.")
    _select_skill_playbooks(prompt, locale="fr")
    matched = set(getattr(_select_skill_playbooks, "_last_matched", []) or [])
    leaked = matched & set(_PROTECTED_CORE)
    assert not leaked, (
        f"Core skill(s) {sorted(leaked)} sélectionné(s) implicitement pour le prompt :\n"
        f"  {prompt!r}\n"
        f"matched={sorted(matched)}"
    )


def test_protected_core_list_is_non_empty():
    """Garde-fou : la promesse d'``allow_implicit_invocation: false`` doit
    rester appliquée à au moins un skill core, sinon ce test perd sa raison
    d'être."""
    assert _PROTECTED_CORE, (
        "Aucun skill core avec allow_implicit_invocation=false trouvé — "
        "vérifier les frontmatters des runtime-* skills."
    )
