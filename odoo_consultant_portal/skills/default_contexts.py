"""Default Markdown playbooks for application skills.

These files are editable from Settings once exposed through the context editor.
They are intentionally short: the router injects only the playbooks relevant to
the current turn, and the tool schema remains the authoritative API contract.
"""

from pathlib import Path

COMMON_READ_ONLY = """\
## Principes communs
- Ce skill est en lecture seule : utilise-le sans demander d'autorisation quand il peut confirmer un fait.
- Cite toujours les paramètres importants utilisés (modèle, domaine, chemin, groupement).
- Si le résultat contredit le contexte Markdown, le résultat du skill gagne.
- Si le résultat est incomplet à cause des droits utilisateur ou d'un chemin absent, signale la limite.
"""


SKILL_CONTEXT_DEFAULTS: dict[str, str] = {
    "skill-query-odoo.md": COMMON_READ_ONLY + """
## query_odoo
Utilise `query_odoo` pour lire des enregistrements concrets via `search_read`.

Bonnes pratiques :
- Appelle `get_odoo_fields` avant si le modèle ou les champs sont incertains.
- Demande seulement les champs utiles, avec `limit` raisonnable.
- Pour un volume total, utilise `count_odoo`; pour un KPI groupé, utilise `read_group_odoo`.
- Dans la réponse, indique le domain utilisé et distingue échantillon vs exhaustif.
""",
    "skill-count-odoo.md": COMMON_READ_ONLY + """
## count_odoo
Utilise `count_odoo` pour donner un volume fiable d'enregistrements correspondant à un domain.

Bonnes pratiques :
- Ne déduis pas un total depuis la taille d'un échantillon `query_odoo`.
- Vérifie les champs du domain si la structure est incertaine.
- Rappelle qu'un utilisateur Odoo restreint peut voir un comptage partiel.
""",
    "skill-read-group-odoo.md": COMMON_READ_ONLY + """
## read_group_odoo
Utilise `read_group_odoo` pour les KPI et agrégats : CA par mois, factures par état, stock par emplacement, heures par projet.

Bonnes pratiques :
- `fields` doit contenir les mesures et les champs groupés utiles.
- `groupby` accepte les champs simples et les granularités date Odoo (`date:month`, `create_date:week`).
- Pour des totaux financiers, précise toujours le domain, la devise implicite et la société active si connue.
""",
    "skill-get-odoo-fields.md": COMMON_READ_ONLY + """
## get_odoo_fields
Utilise `get_odoo_fields` dès qu'un nom de champ, une relation ou un champ Studio `x_*` est incertain.

Bonnes pratiques :
- Sans `field_names`, lis l'index condensé pour repérer relations et champs custom.
- Avec `field_names`, confirme le détail exact avant un domain ou une opération Creator.
- Si un champ attendu manque, cherche une variante standard, Studio ou version-spécifique.
""",
    "skill-inspect-installed-modules.md": COMMON_READ_ONLY + """
## inspect_installed_modules
Utilise `inspect_installed_modules` pour comprendre le périmètre réel d'une instance : apps actives, modules techniques, modules custom probables.

Bonnes pratiques :
- En migration, commence par ce skill avant d'estimer l'effort.
- Croise les modules installés avec le dépôt projet et les sources Enterprise.
- Ne conclus pas qu'une fonctionnalité est absente sans vérifier module installé + droits + menus.
""",
    "skill-inspect-security.md": COMMON_READ_ONLY + """
## inspect_security
Utilise `inspect_security` quand la question porte sur accès, visibilité, boutons absents, règles multi-société ou erreurs d'autorisation.

Bonnes pratiques :
- Inspecte le modèle exact concerné.
- Lis séparément ACL (droits CRUD) et record rules (filtrage des enregistrements).
- Mentionne les groupes impliqués et les domaines de règles quand ils expliquent le symptôme.
""",
    "skill-inspect-menus-actions.md": COMMON_READ_ONLY + """
## inspect_menus_actions
Utilise `inspect_menus_actions` pour retrouver comment accéder à un écran : menus, actions fenêtre, vues d'entrée.

Bonnes pratiques :
- Pour une question utilisateur "où cliquer", ce skill est plus fiable qu'une navigation devinée.
- Après avoir identifié l'action, utilise `inspect_odoo_view` si les champs visibles ou la vue exacte comptent.
""",
    "skill-inspect-studio.md": COMMON_READ_ONLY + """
## inspect_studio
Utilise `inspect_studio` pour inventorier modèles `x_*`, champs `x_*`, vues Studio, menus, actions serveur, crons et automatisations.

Bonnes pratiques :
- En migration ou Creator, inspecte Studio avant de proposer une modification.
- Filtre par modèle (`model_filter`) quand la demande est ciblée.
- Distingue toujours standard Odoo, Studio et module custom.
""",
    "skill-inspect-odoo-view.md": COMMON_READ_ONLY + """
## inspect_odoo_view
Utilise `inspect_odoo_view` pour répondre sur un écran réel : champs visibles, readonly, required, invisible, widgets, arch assemblée.

Bonnes pratiques :
- Obligatoire avant tout `modify_view` en Creator.
- Base les xpath sur l'arch assemblée ou le `structural_skeleton`, jamais sur une hypothèse.
- Si l'utilisateur parle d'un onglet ou bouton, cherche son `name` ou `string` dans la vue inspectée.
""",
    "skill-inspect-odoo-report.md": COMMON_READ_ONLY + """
## inspect_odoo_report
Utilise `inspect_odoo_report` pour les PDF/QWeb : facture, devis, BL, layout société, papier, héritage de templates.

Bonnes pratiques :
- Obligatoire avant tout `modify_report` en Creator.
- Les xpath doivent cibler un élément présent dans `qweb_archs`.
- Pour en-tête/pied de page, hérite du layout actif de la société, pas du template document.
""",
    "skill-search-odoo-source.md": COMMON_READ_ONLY + """
## search_odoo_source
Utilise `search_odoo_source` pour vérifier noms de modèles, champs, méthodes et comportements standards dans les sources Odoo locales.

Bonnes pratiques :
- Cherche d'abord largement, puis restreins par `path`.
- Enterprise est sous `enterprise/<module>`, pas sous `addons/`.
- Le module `base` et le coeur ORM sont sous `community/odoo/...`.
""",
    "skill-read-odoo-file.md": COMMON_READ_ONLY + """
## read_odoo_file
Utilise `read_odoo_file` après une recherche source pour lire l'implémentation complète.

Bonnes pratiques :
- Lis une fenêtre courte autour des lignes trouvées.
- Cite chemin et lignes dans la réponse.
- Si le fichier est long, lis plusieurs fenêtres ciblées plutôt qu'un bloc massif.
""",
    "skill-git-show-commit.md": COMMON_READ_ONLY + """
## git_show_commit
Utilise `git_show_commit` dès que l'utilisateur donne un SHA de commit.

Bonnes pratiques :
- Ne résume jamais un commit sans l'avoir lu.
- Choisis le bon scope : `odoo`, `enterprise`, `target` ou `project`.
- Si le diff est tronqué, base la synthèse sur les stats/fichiers et propose une lecture ciblée.
""",
    "skill-search-target-source.md": COMMON_READ_ONLY + """
## search_target_source
Utilise `search_target_source` en migration pour vérifier la version cible.

Bonnes pratiques :
- Compare toujours source et cible avant de conclure à un breaking change.
- Recherche le même symbole dans les deux versions.
- Signale les suppressions, renommages et changements de signature.
""",
    "skill-read-target-file.md": COMMON_READ_ONLY + """
## read_target_file
Utilise `read_target_file` après `search_target_source` pour lire l'implémentation cible.

Bonnes pratiques :
- Cite le fichier cible séparément du fichier source.
- Dans une comparaison, structure la réponse `Source | Cible | Impact | Action`.
""",
    "skill-search-project-source.md": COMMON_READ_ONLY + """
## search_project_source
Utilise `search_project_source` pour trouver overrides, modèles custom, vues XML et logique métier du client.

Bonnes pratiques :
- Pour lister les modules, préfère `list_project_modules`.
- Pour un override Python, cherche `_inherit`, le nom de méthode ou le modèle exact.
- Lis ensuite les fichiers pertinents avec `read_project_file`.
""",
    "skill-read-project-file.md": COMMON_READ_ONLY + """
## read_project_file
Utilise `read_project_file` pour confirmer l'implémentation exacte d'un module custom.

Bonnes pratiques :
- Lis les manifests avant d'analyser un module.
- Cite chemin et lignes.
- En migration, croise avec les changements de la version cible.
""",
    "skill-list-project-modules.md": COMMON_READ_ONLY + """
## list_project_modules
Utilise `list_project_modules` pour obtenir un inventaire structuré des modules client depuis leurs manifests.

Bonnes pratiques :
- Commence par ce skill avant une analyse globale de dépôt.
- Regarde `depends`, `data`, `assets`, `installable` et `application`.
- Un manifest absent ou invalide doit être signalé comme limite de l'inventaire.
""",
    "skill-count-source-lines.md": COMMON_READ_ONLY + """
## count_source_lines
Utilise `count_source_lines` pour une volumétrie fiable de code.

Bonnes pratiques :
- Ne transforme jamais des matches grep en nombre de lignes total.
- Groupe par `module` pour estimer l'effort de migration.
- Restreins `path` et `file_types` si le dépôt est très gros.
""",
}

def _load_markdown_contexts() -> dict[str, str]:
    context_dir = Path(__file__).with_name("context")
    if not context_dir.is_dir():
        return {}
    return {
        path.name: path.read_text(encoding="utf-8").strip() + "\n"
        for path in sorted(context_dir.glob("skill-*.md"))
    }


# Prefer the package Markdown files. The inline constants above remain as a
# fallback for editable installs or packaging mistakes where data files were not
# included.
SKILL_CONTEXT_DEFAULTS.update(_load_markdown_contexts())
SKILL_CONTEXT_DEFAULTS_EN: dict[str, str] = SKILL_CONTEXT_DEFAULTS
