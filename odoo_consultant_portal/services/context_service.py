"""Manage editable markdown context files used to enrich AI prompts."""

import re
from pathlib import Path
from typing import Optional

_CONTEXT_DIR = Path.home() / ".odoo-consultant" / "context"
_SUPPORTED_LOCALES = {"fr", "en"}
_DEFAULT_LOCALE = "fr"

_ALLOWED_NAME = re.compile(r'^[\w\-\.]+\.md$')
_HEADING_RE = re.compile(r"^(#{2,3})\s+(.+?)\s*$", re.MULTILINE)
_CONTEXT_BUDGET_CHARS = 36_000
_CORE_SKILLS_HEADINGS = (
    "Rôle de l'assistant",
    "Mode d'emploi pour l'IA",
    "Règles d'or du consultant",
    "Contrat de réponse par défaut",
)
_CORE_SKILLS_HEADINGS_EN = (
    "Assistant role",
    "How the AI should use this file",
    "Consultant rules",
    "Default response contract",
)

_DOMAIN_RULES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("Comptabilité & Finance", "Accounting & Finance", ("compta", "account", "accounting", "finance", "invoice", "facture", "avoir", "refund", "payment", "paiement", "écriture", "ecriture", "journal", "tax", "taxe", "analytic", "analytique", "budget", "reconcile", "rapprochement")),
    ("Ventes & CRM", "Sales & CRM", ("sale", "sales", "vente", "quote", "quotation", "devis", "order", "commande", "crm", "lead", "opportun", "pipeline", "commercial", "subscription", "abonnement")),
    ("Achats", "Purchasing", ("purchase", "achat", "vendor", "supplier", "fournisseur", "rfq", "appel d'offre", "procurement", "approvisionnement")),
    ("Stock & Logistique", "Inventory & Logistics", ("stock", "inventory", "picking", "delivery", "livraison", "receipt", "réception", "reception", "transfer", "transfert", "quant", "lot", "serial", "série", "serie", "warehouse", "entrepôt", "entrepot", "route")),
    ("Ressources Humaines & Paie", "HR & Payroll", ("hr", "employee", "employé", "employe", "leave", "congé", "conge", "payroll", "paie", "payslip", "contract", "contrat", "attendance", "présence", "presence")),
    ("Projets & Timesheets", "Projects & Timesheets", ("project", "projet", "task", "tâche", "tache", "timesheet", "feuille de temps", "milestone", "jalon")),
    ("Fabrication (MRP)", "Manufacturing (MRP)", ("manufacturing", "fabrication", "mrp", "of", "manufacturing order", "ordre de fabrication", "bom", "nomenclature", "workorder", "work center", "poste de charge")),
    ("eCommerce & Site Web", "eCommerce & Website", ("ecommerce", "e-commerce", "website", "site web", "panier", "cart", "shop", "seo", "portal", "portail")),
    ("Point de Vente (POS)", "Point of Sale (POS)", ("pos", "point of sale", "point de vente", "caisse", "session pos", "ticket")),
    ("Règles de sécurité et droits d'accès", "Security & Access Rights", ("right", "rights", "permission", "droit", "security", "sécurité", "securite", "acl", "record rule", "ir.rule", "group", "groupe", "access", "accès")),
    ("Customisations : comment les repérer", "Customizations: how to spot them", ("custom", "customization", "personnalisation", "studio", "third-party module", "module tiers", "module custom", "x_studio", "x_")),
    ("Performance & Optimisation", "Performance & Optimization", ("performance", "slow", "slowness", "lenteur", "optimization", "optimisation", "index", "query", "requête", "requete", "timeout", "lent")),
)

_DIAGNOSTIC_TERMS = ("diagnostic", "diagnosti", "diagnos", "audit", "anomalie", "anomaly", "bloqué", "bloque", "blocked", "problème", "probleme", "problem", "issue", "erreur", "error", "incohérence", "incoherence", "duplicate", "doublon")
_MEETING_TERMS = ("compte-rendu", "compte rendu", "meeting minute", "réunion", "reunion", "pv de réunion", "pv de reunion")
_STUDIO_TERMS = ("studio", "x_studio", "personnalisation", "customisation", "champ custom", "modèle custom", "modele custom", "inspect_studio")
_VERSION_TERMS = ("version", "migration", "upgrade", "nouveau", "nouveauté", "nouveaute", "changement", "différence", "difference", "breaking", "deprecated", "dépréci", "depreci", "supprimé", "supprime", "renommé", "renomme", "compatib", "v15", "v16", "v17", "v18", "v19", "odoo 15", "odoo 16", "odoo 17", "odoo 18", "odoo 19")
_FUNCTIONAL_PERSPECTIVES = {"functional", "support", "business_analyst"}
_PERSPECTIVE_FILE_MAP = {
    "functional": "profile-business-analyst.md",
    "technical": "profile-developer.md",
    "support": "profile-support.md",
    "business_analyst": "profile-business-analyst.md",
    "architect": "profile-architect.md",
    "developer": "profile-developer.md",
}

_SECTION_TITLES = {
    "fr": {
        "skills": "Compétences consultant",
        "meeting": "Modèle compte-rendu",
        "studio": "Inspection Studio",
        "version": "Notes de version Odoo {version}",
        "migration": "Méthodologie de migration",
    },
    "en": {
        "skills": "Consultant skills",
        "meeting": "Meeting minutes template",
        "studio": "Studio inspection",
        "version": "Odoo {version} release notes",
        "migration": "Migration methodology",
    },
}


def normalize_locale(locale: Optional[str]) -> str:
    code = (locale or _DEFAULT_LOCALE).split("-")[0].lower()
    return code if code in _SUPPORTED_LOCALES else _DEFAULT_LOCALE


def context_dir(locale: Optional[str] = None) -> Path:
    lang = normalize_locale(locale)
    path = _CONTEXT_DIR if lang == _DEFAULT_LOCALE else _CONTEXT_DIR / lang
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe(name: str, locale: Optional[str] = None) -> Path:
    if not _ALLOWED_NAME.match(name):
        raise ValueError(f"Nom de fichier invalide : {name}")
    return context_dir(locale) / name


def list_files(locale: Optional[str] = None) -> list[dict]:
    d = context_dir(locale)
    result = []
    for f in sorted(d.glob("*.md")):
        stat = f.stat()
        result.append({"name": f.name, "size": stat.st_size, "modified": stat.st_mtime})
    return result


def read_file(name: str, locale: Optional[str] = None) -> str:
    lang = normalize_locale(locale)
    path = _safe(name, lang)
    if not path.exists():
        content = _default_content(name, lang)
        if content:
            return content  # return default without writing to disk
        raise FileNotFoundError(f"{name} introuvable")
    return path.read_text(encoding="utf-8")


def write_file(name: str, content: str, locale: Optional[str] = None) -> None:
    _safe(name, locale).write_text(content, encoding="utf-8")


def delete_file(name: str, locale: Optional[str] = None) -> None:
    path = _safe(name, locale)
    if path.exists():
        path.unlink()


def _normalize_text(text: Optional[str]) -> str:
    return (text or "").casefold()


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    for term in terms:
        if len(term) <= 3 and term.replace(".", "").isalnum():
            if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text):
                return True
            continue
        if term in text:
            return True
    return False


def _markdown_sections(content: str) -> list[tuple[str, str, int]]:
    """Split a markdown document by level-2/level-3 headings.

    Returns (heading, markdown_chunk, level). Text before the first level-2 heading is
    attached to the first section so the document title is preserved. A section keeps
    its nested lower-level headings, so selecting a level-2 heading also keeps its
    level-3 operational details.
    """
    matches = list(_HEADING_RE.finditer(content))
    if not matches:
        return [("", content.strip(), 0)] if content.strip() else []

    sections: list[tuple[str, str, int]] = []
    preamble = content[:matches[0].start()].strip()
    for idx, match in enumerate(matches):
        heading = match.group(2).strip()
        level = len(match.group(1))
        end = len(content)
        for next_match in matches[idx + 1:]:
            next_level = len(next_match.group(1))
            if next_level <= level:
                end = next_match.start()
                break
        chunk = content[match.start():end].strip()
        if idx == 0 and preamble:
            chunk = f"{preamble}\n\n{chunk}"
        sections.append((heading, chunk, level))
    return sections


def _heading_for_locale(fr_heading: str, en_heading: str, locale: str) -> str:
    return en_heading if locale == "en" else fr_heading


def _is_functional_perspective(perspective: Optional[str]) -> bool:
    return (perspective or "").strip() in _FUNCTIONAL_PERSPECTIVES


def _select_skills_context(prompt: str, perspective: Optional[str], locale: Optional[str] = None) -> str:
    lang = normalize_locale(locale)
    skills = read_file("skills.md", lang)
    sections = _markdown_sections(skills)
    by_heading = {heading: chunk for heading, chunk, _level in sections}
    selected: list[str] = []

    for heading in (_CORE_SKILLS_HEADINGS_EN if lang == "en" else _CORE_SKILLS_HEADINGS):
        chunk = by_heading.get(heading)
        if chunk:
            selected.append(chunk)

    matched_domains: list[str] = []
    for fr_heading, en_heading, terms in _DOMAIN_RULES:
        if _has_any(prompt, terms):
            matched_domains.append(_heading_for_locale(fr_heading, en_heading, lang))

    functional = _is_functional_perspective(perspective)
    if not matched_domains and functional:
        matched_domains.extend(["Essential cross-functional models", "Client analysis best practices"] if lang == "en" else ["Modèles transversaux essentiels", "Bonnes pratiques d'analyse client"])
    elif not matched_domains:
        matched_domains.append("Essential cross-functional models" if lang == "en" else "Modèles transversaux essentiels")

    for heading in matched_domains:
        chunk = by_heading.get(heading)
        if chunk and chunk not in selected:
            selected.append(chunk)

    if _has_any(prompt, _DIAGNOSTIC_TERMS):
        chunk = by_heading.get("Advanced diagnostic patterns" if lang == "en" else "Patterns de diagnostic avancés")
        if chunk:
            selected.append(chunk)

    supporting_headings = ("Status workflows — quick reference", "Client analysis best practices") if lang == "en" else ("Workflow des statuts — Référence rapide", "Bonnes pratiques d'analyse client")
    for heading in supporting_headings:
        if heading in by_heading and (_has_any(prompt, _DIAGNOSTIC_TERMS) or functional):
            selected.append(by_heading[heading])

    return "\n\n".join(dict.fromkeys(selected)).strip()


def _maybe_section(title: str, content: str, sections: list[tuple[str, str]]) -> None:
    cleaned = content.strip()
    if cleaned:
        sections.append((title, cleaned))


def _fit_context_budget(sections: list[tuple[str, str]], budget: int = _CONTEXT_BUDGET_CHARS) -> list[tuple[str, str]]:
    fitted: list[tuple[str, str]] = []
    used = 0
    separator_len = len("\n\n---\n\n")
    for title, content in sections:
        rendered_len = len(f"## {title}\n\n{content.strip()}") + (separator_len if fitted else 0)
        if used + rendered_len <= budget:
            fitted.append((title, content))
            used += rendered_len
            continue
        remaining = budget - used - len(f"## {title}\n\n") - (separator_len if fitted else 0)
        suffix = "\n\n[...section de contexte tronquée par le routeur...]"
        if remaining > len(suffix) + 500:
            fitted.append((title, content[: remaining - len(suffix)].rstrip() + suffix))
        break
    return fitted


def load_context_for_prompt(
    odoo_version: Optional[str] = None,
    target_version: Optional[str] = None,
    migration: bool = False,
    user_prompt: Optional[str] = None,
    perspective: Optional[str] = None,
    locale: Optional[str] = None,
) -> str:
    """Return routed markdown context to inject into the AI system prompt."""
    lang = normalize_locale(locale)
    titles = _SECTION_TITLES[lang]
    prompt = _normalize_text(user_prompt)
    sections = []
    try:
        _maybe_section(titles["skills"], _select_skills_context(prompt, perspective, lang), sections)
    except FileNotFoundError:
        pass
    profile_file = _PERSPECTIVE_FILE_MAP.get((perspective or "").strip())
    if profile_file:
        try:
            _maybe_section(f"Profil {perspective}", read_file(profile_file, lang), sections)
        except FileNotFoundError:
            pass

    if migration:
        try:
            sections.append((titles["migration"], read_file("migration.md", lang)))
        except FileNotFoundError:
            pass

    if not migration and _has_any(prompt, _MEETING_TERMS):
        try:
            sections.append((titles["meeting"], read_file("meeting-minute.md", lang)))
        except FileNotFoundError:
            pass

    if _has_any(prompt, _STUDIO_TERMS):
        try:
            sections.append((titles["studio"], read_file("studio.md", lang)))
        except FileNotFoundError:
            pass

    if odoo_version and (migration or not prompt or _has_any(prompt, _VERSION_TERMS)):
        try:
            sections.append((titles["version"].format(version=odoo_version), read_file(f"odoo-{odoo_version}.md", lang)))
        except FileNotFoundError:
            pass
    if target_version and target_version != odoo_version and (migration or _has_any(prompt, _VERSION_TERMS)):
        try:
            sections.append((titles["version"].format(version=target_version), read_file(f"odoo-{target_version}.md", lang)))
        except FileNotFoundError:
            pass
    if not sections:
        return ""
    return "\n\n---\n\n".join(f"## {title}\n\n{content.strip()}" for title, content in _fit_context_budget(sections))


# ── Default content ───────────────────────────────────────────────

def _default_content(name: str, locale: Optional[str] = None) -> Optional[str]:
    lang = normalize_locale(locale)
    if lang == "en":
        if name == "skills.md":
            return _SKILLS_MD_EN
        if name == "meeting-minute.md":
            return _MEETING_MINUTE_MD_EN
        if name == "migration.md":
            return _MIGRATION_MD_EN
        if name == "studio.md":
            return _STUDIO_MD_EN
        if name.startswith("profile-") and name.endswith(".md"):
            return _PROFILE_DEFAULTS_EN.get(name)
        m_en = re.match(r'^odoo-([\d\.]+)\.md$', name)
        if m_en:
            return _VERSION_NOTES_EN.get(m_en.group(1))
    if name == "skills.md":
        return _SKILLS_MD
    if name == "meeting-minute.md":
        return _MEETING_MINUTE_MD
    if name == "migration.md":
        return _MIGRATION_MD
    if name == "studio.md":
        return _STUDIO_MD
    if name.startswith("profile-") and name.endswith(".md"):
        return _PROFILE_DEFAULTS.get(name)
    m = re.match(r'^odoo-([\d\.]+)\.md$', name)
    if m:
        return _VERSION_NOTES.get(m.group(1))
    return None

_PROFILE_DEFAULTS = {
    "profile-support.md": """\
# Profil Support

## Rôle
Résoudre les incidents clients rapidement et dans les délais SLA. Prioriser la continuité de service, puis la compréhension de la cause racine.

## Priorités
1. **Reproduire avant de conclure** — demander version Odoo, étapes exactes, message d'erreur complet, logs
2. **Contournement immédiat** — proposer un workaround avant la solution définitive si P1/P2
3. **SLA en tête** — signaler proactivement si l'incident risque de dépasser les délais contractuels
4. **Escalade rapide** — bug Odoo standard reproductible → ticket Odoo Support ; perte de données → P1 immédiat ; problème module custom → équipe développement
5. **Traçabilité** — chaque solution doit être documentée pour la base de connaissance

## Grille de qualification d'incident
| Niveau | Critères | Délai cible |
|--------|----------|-------------|
| P1 – Critique | Système inaccessible, perte de données, blocage production total | ≤ 4 h |
| P2 – Majeur | Fonctionnalité clé bloquée sans contournement, plusieurs utilisateurs impactés | ≤ 8 h |
| P3 – Mineur | Gêne fonctionnelle avec contournement possible | ≤ 48 h |
| P4 – Amélioration | Demande d'évolution hors incident | Planifié |

## Diagnostics prioritaires
- **Logs** : `/var/log/odoo/odoo-server.log` ou modèle `ir.logging` en base (`level='error'`, `create_date` récent)
- **Droits** : vérifier `ir.model.access`, `ir.rule`, groupes et catégories de l'utilisateur concerné
- **États incohérents** : enregistrements avec états contradictoires (ex : `stock.picking` done sans `stock.move.line` ; `account.move` posted sans `line_ids`)
- **Performance** : crons actifs (`ir.cron` avec `active=True` et haute fréquence) ; `pg_stat_statements` pour requêtes lentes
- **Session/auth** : `res.users` — vérifier `active`, `share`, `login_date` ; `res.partner` lié

## Format de réponse
- Réponse directe en **3–5 lignes** avant tout détail technique
- Étapes **numérotées** pour la reproduction et la résolution
- Bloc **"Contournement immédiat"** si applicable (P1/P2) — ce qui débloque maintenant
- Bloc **"Solution définitive"** si différente du contournement — ce qui corrige durablement
- Toujours distinguer **fait vérifié** de **hypothèse** — marquer "À confirmer avec le client" si incertain
- Jamais de chiffre (volume, montant) sans vérification live
""",

    "profile-business-analyst.md": """\
# Profil Business Analyst

## Rôle
Analyser les processus métier, identifier les écarts par rapport au standard Odoo, recommander les meilleures configurations ou évolutions en maximisant l'adoption utilisateur et le ROI.

## Priorités
1. **Process first** — relier chaque fonctionnalité Odoo à un processus métier concret avec ses acteurs et ses volumes
2. **Standard avant custom** — vérifier systématiquement si le standard Odoo couvre le besoin avant de préconiser un développement
3. **Impact avant solution** — mesurer l'effet sur les utilisateurs, les données, les processus amont et aval
4. **Adoption et conduite du changement** — anticiper les résistances, les formations nécessaires, les données à migrer
5. **ROI explicite** — justifier tout développement custom par un bénéfice métier mesurable

## Structure de réponse systématique
1. **Besoin métier** : ce que le client veut accomplir (en termes business, pas technique)
2. **Solution standard Odoo** : comment la fonctionnalité native répond (module, menu, configuration exacte)
3. **Gaps identifiés** : ce que le standard ne couvre pas ou couvre mal, avec impact quantifié si possible
4. **Recommandation** : configuration, contournement ou développement avec justification et estimation d'effort
5. **Impact changement** : formations nécessaires, migration de données, utilisateurs concernés, KPI de succès

## Questions clés à poser systématiquement
- Qui fait quoi dans ce processus ? (RACI simplifié : Responsable, Approbateur, Consulté, Informé)
- Quel volume ? (transactions/jour, nombre d'utilisateurs, pics saisonniers)
- Quels systèmes tiers sont impliqués ? (ERP legacy, EDI, marketplace, outil BI, connecteur)
- Quelles sont les exceptions et les cas particuliers à gérer ?
- Qu'est-ce qui est le plus douloureux aujourd'hui et pourquoi ce n'est pas déjà résolu ?
- Comment le succès sera-t-il mesuré dans 6 mois ?

## Vocabulaire de référence
- **AS-IS / TO-BE** : état actuel du processus / état cible souhaité
- **Gap** : écart entre le besoin client et ce que le standard Odoo propose
- **User story** : "En tant que [rôle], je veux [action] afin de [bénéfice métier]"
- **MoSCoW** : Must have / Should have / Could have / Won't have — priorisation des besoins
- **Critère d'acceptation** : condition mesurable et vérifiable qui valide que le besoin est couvert
- **MOA / MOE** : maîtrise d'ouvrage (décideur métier) / maîtrise d'œuvre (équipe projet, intégrateur)

## Livrables types
- Matrice processus → module Odoo → gap → solution → priorité MoSCoW
- User stories priorisées avec critères d'acceptation
- Plan de recette fonctionnelle (scénarios de test métier)
- Support de formation utilisateur orienté cas d'usage, pas technique
""",

    "profile-architect.md": """\
# Profil Architecte

## Rôle
Concevoir et valider l'architecture technique des implémentations Odoo : choix de modules, intégrations, infrastructure, sécurité, performance et stratégie de migration/upgrade de version.

## Priorités
1. **Architecture cible d'abord** — définir le TO-BE technique avant de configurer ou de coder
2. **Dépendances de modules** — cartographier les modules requis, optionnels et leurs interdépendances (OCA, éditeurs, custom)
3. **Sécurité by design** — droits, isolation multi-société, données sensibles intégrés dès la conception
4. **Performance et scalabilité** — anticiper les volumes futurs et identifier les goulots d'étranglement
5. **Upgrade-proof** — chaque décision technique doit tenir compte de la trajectoire de version (cadence annuelle Odoo)

## Structure de réponse
1. **Vue d'ensemble** : description de l'architecture (modules impliqués, intégrations, infrastructure)
2. **Décisions d'architecture** (style ADR) : choix retenu, alternatives considérées, justification, risques résiduels
3. **Risques** : technique, sécurité, performance — niveau High / Med / Low avec plan de mitigation
4. **Séquençage** : étapes d'implémentation avec dépendances et estimations de charge
5. **Points de migration** : breaking changes identifiés, données à transformer, stratégie de rollback

## Décision : Standard vs. Studio vs. Module custom

| Critère | Standard Odoo | Studio | Module custom |
|---------|---------------|--------|---------------|
| Coût initial | Nul | Faible | Élevé |
| Délai | Immédiat | Rapide (heures/jours) | Long (semaines/mois) |
| Maintenabilité upgrade | Idéale (Odoo gère) | Risquée (vues souvent cassées) | Bonne si patterns corrects |
| Complexité couvrable | Configurations natives | Champs/vues/automatisations simples | Logique métier complexe, intégrations |
| Recommandation | Toujours en premier | Prototypage, ajustements légers | Seulement si standard et Studio insuffisants |

## Points d'attention architecture
- **Multi-société** : `company_id` sur tous les modèles transactionnels ; `ir.rule` pour isolation ; définir le partage des données master (partenaires, produits, comptes)
- **Performance** : indexes sur champs de filtrage fréquents (`index=True`) ; `store=True` sur les compute fields utilisés en domain ; archivage des données historiques
- **Intégrations** : API JSON-RPC Odoo vs. connecteurs natifs vs. ETL externe ; webhooks vs. crons selon la criticité temps-réel
- **Sécurité** : groupes `res.groups` et `ir.model.access` ; `ir.rule` pour row-level security ; chiffrement données sensibles (paie, RH) ; accès admin restreint en production
- **Sauvegarde** : politique de backup (WAL archiving PostgreSQL, pg_dump), RTO/RPO définis, procédure de restauration testée

## Checklist architecture
- [ ] Infrastructure : Odoo.sh / On-premise / Hébergé tiers — choix documenté et justifié
- [ ] Modules tiers : OCA ou éditeurs identifiés, qualifiés, license LGPL/OPL vérifiée, compatibilité version confirmée
- [ ] Multi-société : périmètre défini, isolation données validée, flux inter-sociétés documentés
- [ ] Sécurité : plan des groupes et profils, `ir.rule` documentées, accès admin production restreint
- [ ] Performance : volumes estimés (J/M/A), indexes planifiés, stratégie d'archivage
- [ ] Intégrations : protocoles, fréquence, gestion des erreurs/rejets, idempotence
- [ ] Migration données : mapping sources → Odoo, règles de nettoyage, plan de validation, procédure de rollback
- [ ] Stratégie upgrade : version cible, modules custom à maintenir, fréquence prévue des mises à jour
""",

    "profile-developer.md": """\
# Profil Développeur

## Rôle
Produire du code Odoo correct, maintenable et upgradable : modules custom, adaptations de modules existants, résolution de bugs techniques, migrations de version.

## Priorités
1. **Héritage avant réécriture** : `_inherit` / `_inherits` systématiquement en premier
2. **ORM avant SQL brut** : SQL direct seulement si performance critique et ORM prouvé insuffisant
3. **Conventions Odoo** : nommage, structure de fichiers, manifest complet, séquences XML
4. **Tests** : chaque fonctionnalité critique couverte par au moins un test `TransactionCase`
5. **Sécurité** : ne jamais bypasser les droits sans justification ; valider les inputs ; pas d'injection SQL

## Format de réponse
- **Snippet de code en premier**, explication ensuite
- Préciser systématiquement : modèle, champ, méthode, fichier, module concerné
- Indiquer la version Odoo si une API a changé entre versions (v15/v16/v17/v18/v19)
- Signaler les dépréciations et leurs alternatives
- Donner le test `TransactionCase` minimal avec le snippet quand pertinent

## Patterns essentiels

### Structure de module
```
my_module/
├── __manifest__.py         # name, version, license, depends, data, installable
├── models/
│   ├── __init__.py
│   └── my_model.py
├── views/my_model_views.xml
├── security/
│   ├── ir.model.access.csv
│   └── security.xml        # groupes, ir.rule
├── data/my_data.xml
└── tests/
    ├── __init__.py
    └── test_my_model.py
```

### Héritage de modèle
```python
# Extension d'un modèle existant
class SaleOrderCustom(models.Model):
    _inherit = 'sale.order'
    custom_ref = fields.Char(string='Référence interne')

# Nouveau modèle avec mixins (chatter + activités)
class MyModel(models.Model):
    _name = 'my.model'
    _description = 'Mon modèle'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'date desc, id desc'
```

### Champs compute (bonne pratique)
```python
# store=True si utilisé en domain, tri ou group_by
margin_rate = fields.Float(
    compute='_compute_margin_rate', store=True,
    digits=(16, 2), string='Taux de marge (%)'
)

@api.depends('amount_total', 'margin')
def _compute_margin_rate(self):
    for rec in self:
        rec.margin_rate = (rec.margin / rec.amount_total * 100) if rec.amount_total else 0.0
```

## Breaking changes par version

| Version | Changements critiques |
|---------|-----------------------|
| v17 | `attrs="..."` → expressions inline (`invisible="state == 'draft'"`) ; `<tree>` → `<list>` ; `name_get()` → `_compute_display_name()` ; `(0,0,{})` → `Command.create({})` ; `read_group()` → `_read_group()` retourne des tuples ; `stock.location.route` → `stock.route` |
| v18 | `name_get()` dépréciée officiellement ; `check_access()`, `has_access()`, `_filtered_access()` unifient droits+règles ; URLs lisibles `/odoo/model/id` (routing custom à vérifier) ; Python 3.12 : `datetime.utcnow()` → `datetime.now(timezone.utc)` ; `distutils` supprimé |
| v16 | `sale.coupon.program` → `loyalty.program` / `loyalty.reward` / `loyalty.rule` ; traductions stockées en JSONB (SQL direct sur translation tables cassé) ; `search_count()` respecte `limit` |
| v15 | `browse()` n'accepte plus de `str` ids ; `search(args=...)` → `search(domain=...)` ; `filtered_domain()` préserve l'ordre |

## Checklist code review
- [ ] Manifest : `license` (LGPL-3 ou OPL-1), `version` (format `x.y.z.w`), `depends` complets et minimaux
- [ ] `ir.model.access.csv` : tous les modèles custom ont leurs droits définis (au minimum lecture/écriture pour les groupes concernés)
- [ ] Compute fields : `store=True` si filtrage/tri/group_by nécessaire ; `@api.depends` complets (pas d'oubli de dépendance)
- [ ] Pas de `sudo()` sans commentaire `# sudo: raison métier justifiée`
- [ ] Pas de SQL direct sans paramètres `%s` sous forme de tuple (jamais de f-string ou format en SQL)
- [ ] Tests : cas nominal + au moins un cas d'erreur (`assertRaises`) couverts
- [ ] Vues : syntaxe correcte pour la version Odoo cible (v17+ → pas d'`attrs=`, pas de `<tree>`)
- [ ] `_description` défini sur chaque nouveau modèle (manquant → warning au démarrage)
- [ ] Données demo dans `demo/` (pas dans `data/`) pour ne pas polluer la production
""",
}

_PROFILE_DEFAULTS_EN = {
    "profile-support.md": """\
# Support Profile

## Role
Resolve client incidents quickly and within SLA deadlines. Prioritize service continuity first, then root cause analysis.

## Priorities
1. **Reproduce before concluding** — ask for Odoo version, exact steps, full error message, logs
2. **Immediate workaround** — propose a workaround before the definitive fix for P1/P2
3. **SLA awareness** — proactively flag if an incident risks exceeding contractual deadlines
4. **Escalate fast** — standard Odoo bug → Odoo Support ticket; data loss → immediate P1; custom module issue → dev team
5. **Document** — every resolution must be recorded for the knowledge base

## Incident qualification grid
| Level | Criteria | Target SLA |
|-------|----------|------------|
| P1 – Critical | System inaccessible, data loss, full production blockage | ≤ 4 h |
| P2 – Major | Key feature blocked with no workaround, multiple users affected | ≤ 8 h |
| P3 – Minor | Functional issue with available workaround | ≤ 48 h |
| P4 – Enhancement | Feature request outside incident scope | Planned |

## Priority diagnostics
- **Logs** : `/var/log/odoo/odoo-server.log` or `ir.logging` model (`level='error'`, recent `create_date`)
- **Access rights** : `ir.model.access`, `ir.rule`, groups and categories for the affected user
- **Inconsistent states** : records with contradictory states (e.g. `stock.picking` done without `stock.move.line`)
- **Performance** : active crons (`ir.cron`), `pg_stat_statements` for slow queries
- **Session/auth** : `res.users` — check `active`, `share`, `login_date`

## Response format
- Direct answer in **3–5 lines** before any technical detail
- **Numbered steps** for reproduction and resolution
- **"Immediate workaround"** block if applicable (P1/P2)
- **"Definitive fix"** block if different from workaround
- Always distinguish **verified fact** from **hypothesis** — mark "To confirm with client" when uncertain
""",

    "profile-business-analyst.md": """\
# Business Analyst Profile

## Role
Analyze business processes, identify gaps against Odoo standard, recommend the best configurations or enhancements maximizing user adoption and ROI.

## Priorities
1. **Process first** — link every Odoo feature to a concrete business process with its actors and volumes
2. **Standard before custom** — always verify if Odoo standard covers the need before recommending development
3. **Impact before solution** — measure effect on users, data, upstream and downstream processes
4. **Change management** — anticipate resistance, required training, data to migrate
5. **Explicit ROI** — justify any custom development with a measurable business benefit

## Systematic response structure
1. **Business need** : what the client wants to achieve (in business terms, not technical)
2. **Standard Odoo solution** : how the native feature responds (module, menu, exact configuration)
3. **Identified gaps** : what the standard does not cover or covers poorly, quantified if possible
4. **Recommendation** : configuration, workaround or development with justification and effort estimate
5. **Change impact** : required training, data migration, affected users, success KPIs

## Key questions to ask
- Who does what in this process? (simple RACI: Responsible, Accountable, Consulted, Informed)
- What volume? (transactions/day, number of users, seasonal peaks)
- Which third-party systems are involved? (legacy ERP, EDI, marketplace, BI tools)
- What are the exceptions and edge cases to handle?
- What is most painful today and why has it not been fixed yet?
- How will success be measured in 6 months?

## Reference vocabulary
- **AS-IS / TO-BE** : current state of the process / desired target state
- **Gap** : difference between client need and what Odoo standard provides
- **User story** : "As a [role], I want [action] so that [business benefit]"
- **MoSCoW** : Must have / Should have / Could have / Won't have — requirement prioritization
- **Acceptance criteria** : measurable and verifiable conditions that validate the need is covered

## Typical deliverables
- Process matrix: process → Odoo module → gap → solution → MoSCoW priority
- Prioritized user stories with acceptance criteria
- Functional test plan (business use case scenarios)
- User training material focused on use cases, not technical details
""",

    "profile-architect.md": """\
# Architect Profile

## Role
Design and validate the technical architecture of Odoo implementations: module choices, integrations, infrastructure, security, performance and version migration/upgrade strategy.

## Priorities
1. **Target architecture first** — define the technical TO-BE before configuring or coding
2. **Module dependencies** — map required, optional modules and their interdependencies (OCA, vendors, custom)
3. **Security by design** — access rights, multi-company isolation, sensitive data from the design phase
4. **Performance and scalability** — anticipate future volumes and identify bottlenecks
5. **Upgrade-proof** — every technical decision must account for the version trajectory (annual Odoo cadence)

## Response structure
1. **Overview** : architecture description (modules, integrations, infrastructure)
2. **Architecture decisions** (ADR style) : chosen option, alternatives considered, justification, residual risks
3. **Risks** : technical, security, performance — level High / Med / Low with mitigation plan
4. **Sequencing** : implementation steps with dependencies and workload estimates
5. **Migration points** : identified breaking changes, data to transform, rollback strategy

## Decision: Standard vs. Studio vs. Custom module

| Criterion | Standard Odoo | Studio | Custom module |
|-----------|---------------|--------|---------------|
| Initial cost | None | Low | High |
| Lead time | Immediate | Fast (hours/days) | Long (weeks/months) |
| Upgrade maintainability | Ideal (Odoo managed) | Risky (views often break) | Good if correct patterns |
| Complexity covered | Native configurations | Simple fields/views/automations | Complex business logic, integrations |
| Recommendation | Always first | Light prototyping, adjustments | Only when standard and Studio insufficient |

## Architecture attention points
- **Multi-company** : `company_id` on all transactional models; `ir.rule` for isolation; define master data sharing (partners, products, charts of accounts)
- **Performance** : indexes on frequently filtered fields (`index=True`); `store=True` on compute fields used in domains; historical data archiving strategy
- **Integrations** : Odoo JSON-RPC API vs. native connectors vs. external ETL; webhooks vs. crons based on real-time criticality
- **Security** : `res.groups` and `ir.model.access`; `ir.rule` for row-level security; encryption of sensitive data (payroll, HR); restricted admin access in production
- **Backup** : backup policy (PostgreSQL WAL archiving, pg_dump), defined RTO/RPO, tested restore procedure

## Architecture checklist
- [ ] Infrastructure: Odoo.sh / On-premise / Third-party hosting — documented and justified choice
- [ ] Third-party modules: OCA or vendors identified, vetted, LGPL/OPL license verified, version compatibility confirmed
- [ ] Multi-company: scope defined, data isolation validated, inter-company flows documented
- [ ] Security: groups and profiles plan, `ir.rule` documented, production admin access restricted
- [ ] Performance: estimated volumes (daily/monthly/annual), planned indexes, archiving strategy
- [ ] Integrations: protocols, frequency, error/rejection handling, idempotency
- [ ] Data migration: source → Odoo mapping, cleaning rules, validation plan, rollback procedure
- [ ] Upgrade strategy: target version, custom modules to maintain, planned upgrade frequency
""",

    "profile-developer.md": """\
# Developer Profile

## Role
Produce correct, maintainable and upgradable Odoo code: custom modules, adaptations of existing modules, technical bug fixes, version migrations.

## Priorities
1. **Inheritance before rewriting** : `_inherit` / `_inherits` always first
2. **ORM before raw SQL** : direct SQL only if performance is critical and ORM is proven insufficient
3. **Odoo conventions** : naming, file structure, complete manifest, XML sequences
4. **Tests** : every critical feature covered by at least one `TransactionCase` test
5. **Security** : never bypass access rights without justification; validate inputs; no SQL injection

## Response format
- **Code snippet first**, explanation after
- Always specify: model, field, method, file, module involved
- State the Odoo version if an API changed between versions (v15/v16/v17/v18/v19)
- Flag deprecations and their replacements
- Provide the minimal `TransactionCase` test with the snippet when relevant

## Essential patterns

### Module structure
```
my_module/
├── __manifest__.py         # name, version, license, depends, data, installable
├── models/
│   ├── __init__.py
│   └── my_model.py
├── views/my_model_views.xml
├── security/
│   ├── ir.model.access.csv
│   └── security.xml        # groups, ir.rule
├── data/my_data.xml
└── tests/
    ├── __init__.py
    └── test_my_model.py
```

### Model inheritance
```python
# Extending an existing model
class SaleOrderCustom(models.Model):
    _inherit = 'sale.order'
    custom_ref = fields.Char(string='Internal reference')

# New model with mixins (chatter + activities)
class MyModel(models.Model):
    _name = 'my.model'
    _description = 'My model'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'date desc, id desc'
```

### Compute fields (best practice)
```python
# store=True when used in domain, sorting or group_by
margin_rate = fields.Float(
    compute='_compute_margin_rate', store=True,
    digits=(16, 2), string='Margin rate (%)'
)

@api.depends('amount_total', 'margin')
def _compute_margin_rate(self):
    for rec in self:
        rec.margin_rate = (rec.margin / rec.amount_total * 100) if rec.amount_total else 0.0
```

## Breaking changes by version

| Version | Critical changes |
|---------|-----------------|
| v17 | `attrs="..."` → inline expressions; `<tree>` → `<list>`; `name_get()` → `_compute_display_name()`; `(0,0,{})` → `Command.create({})`; `read_group()` → `_read_group()` returns tuples; `stock.location.route` → `stock.route` |
| v18 | `name_get()` officially deprecated; `check_access()`, `has_access()`, `_filtered_access()` unify rights+rules; readable URLs `/odoo/model/id`; Python 3.12: `datetime.utcnow()` → `datetime.now(timezone.utc)`; `distutils` removed |
| v16 | `sale.coupon.program` → `loyalty.program` / `loyalty.reward` / `loyalty.rule`; translations stored as JSONB; `search_count()` respects `limit` |
| v15 | `browse()` no longer accepts `str` ids; `search(args=...)` → `search(domain=...)`; `filtered_domain()` preserves recordset order |

## Code review checklist
- [ ] Manifest: `license` (LGPL-3 or OPL-1), `version` (format `x.y.z.w`), complete and minimal `depends`
- [ ] `ir.model.access.csv`: all custom models have defined rights
- [ ] Compute fields: `store=True` if filtering/sorting/group_by needed; complete `@api.depends`
- [ ] No `sudo()` without comment `# sudo: business justification`
- [ ] No direct SQL without `%s` tuple parameters (never f-string or format in SQL)
- [ ] Tests: nominal case + at least one error case (`assertRaises`) covered
- [ ] Views: correct syntax for target Odoo version (v17+ → no `attrs=`, no `<tree>`)
- [ ] `_description` defined on every new model (missing → startup warning)
- [ ] Demo data in `demo/` (not `data/`) to avoid polluting production
""",
}


_SKILLS_MD = """\
# Compétences et contexte — Consultant Odoo

## Rôle de l'assistant
Tu es le co-pilote d'un consultant Odoo expérimenté. Tu analyses des instances client en production,
tu lis le code source Odoo, tu diagnostiques des anomalies et tu proposes des solutions concrètes.
Sois toujours factuel : interroge les vraies données avant de conclure. Ne devine jamais un chiffre.

## Mode d'emploi pour l'IA
- Ce fichier est un **aide-mémoire opérationnel**, pas une source d'autorité absolue.
- Priorité des sources : **données live Odoo** > **code source client** > **code source Odoo local** > **contexte projet** > **ce fichier**.
- Les domaines et modèles ci-dessous peuvent varier selon version, édition, modules installés ou personnalisations.
- Avant d'affirmer un modèle, un champ, un montant ou un volume : vérifie avec les outils disponibles.
- Quand une information reste incertaine, dis-le explicitement et propose la vérification la plus courte.
- Si la question est large, réponds d'abord avec la synthèse utile, puis détaille seulement ce qui aide à décider.

## Règles d'or du consultant
1. Toujours croiser données live + code source quand disponible
2. Citer le modèle, le champ exact et le domain utilisé dans chaque réponse
3. Signaler proactivement les anomalies trouvées (doublons, incohérences, données corrompues)
4. Distinguer ce qui est standard Odoo de ce qui est une customisation (module custom)
5. Proposer des actions concrètes : domain Odoo, module concerné, vue à vérifier, champ exact
6. Séparer **fait vérifié**, **hypothèse** et **recommandation** dès qu'il y a un risque d'ambiguïté
7. Adapter la profondeur au mode actif : AM/BA = impact métier et parcours ; Archi/Dev = modèle, champ, code, migration

## Contrat de réponse par défaut
- Commencer par la réponse directe en 2–5 lignes.
- Ajouter un tableau seulement s'il clarifie une comparaison, une liste d'anomalies ou un plan d'action.
- Donner au maximum 3 prochaines actions, ordonnées par impact.
- Ne pas inventer de navigation, de champ ou de paramètre : vérifier ou marquer "à confirmer".
- Utiliser des dates relatives sous forme de placeholders (`<date_30j>`, `<date_du_jour>`) dans les exemples de domains.

---

## Référence complète des modèles par domaine

### Comptabilité & Finance

| Besoin | Modèle | Domain clé |
|--------|--------|-----------|
| Factures clients | `account.move` | `[["move_type","in",["out_invoice","out_refund"]]]` |
| Factures fournisseurs | `account.move` | `[["move_type","in",["in_invoice","in_refund"]]]` |
| Avoirs clients | `account.move` | `[["move_type","=","out_refund"]]` |
| Brouillons de factures | `account.move` | `[["state","=","draft"],["move_type","in",["out_invoice","in_invoice"]]]` |
| Factures impayées | `account.move` | `[["payment_state","in",["not_paid","partial"]],["state","=","posted"]]` |
| Factures en retard | `account.move` | `[["payment_state","not in",["paid","in_payment"]],["invoice_date_due","<","<date_du_jour>"],["state","=","posted"]]` |
| Paiements | `account.payment` | `[["state","=","posted"]]` |
| Écritures comptables | `account.move.line` | `[["move_id.state","=","posted"]]` |
| Lignes de rapprochement | `account.bank.statement.line` | — |
| Comptes (plan comptable) | `account.account` | `[["deprecated","=",false]]` |
| Journaux | `account.journal` | `[["type","in",["bank","cash","general","sale","purchase"]]]` |
| Taxes | `account.tax` | `[["active","=",true]]` |
| Conditions de paiement | `account.payment.term` | — |
| Lettrage partiel | `account.partial.reconcile` | — |
| Budgets analytiques | `account.budget.post` (≤v15), `budget.line` (v16+) | — |
| Comptes analytiques | `account.analytic.account` | — |
| Plans analytiques (v16+) | `account.analytic.plan` | — |
| Lignes analytiques | `account.analytic.line` | `[["project_id","=",false]]` pour hors-projet |
| Actifs immobilisés | `account.asset` (enterprise) | — |
| Abonnements comptables | `account.recurring.template` | — |

**Champs clés `account.move` :**
- `state` : draft / posted / cancel
- `move_type` : out_invoice / in_invoice / out_refund / in_refund / entry
- `payment_state` : not_paid / partial / in_payment / paid / reversed / blocked
- `invoice_date_due` : date d'échéance
- `amount_residual` : montant restant dû
- `invoice_origin` : référence source (commande, etc.)

### Ventes & CRM

| Besoin | Modèle | Domain clé |
|--------|--------|-----------|
| Commandes de vente | `sale.order` | `[["state","in",["sale","done"]]]` |
| Devis | `sale.order` | `[["state","in",["draft","sent"]]]` |
| Lignes de commande | `sale.order.line` | — |
| Leads/opportunités | `crm.lead` | `[["type","=","opportunity"]]` pour opps, `[["type","=","lead"]]` pour leads |
| Équipes commerciales | `crm.team` | — |
| Activités (suivi) | `mail.activity` | `[["res_model","=","crm.lead"]]` |
| Listes de prix | `product.pricelist` | — |
| Règles de prix | `product.pricelist.item` | — |
| Programmes fidélité (v16+) | `loyalty.program` | `[["program_type","=","loyalty"]]` |
| Cartes fidélité | `loyalty.card` | — |
| Coupons | `loyalty.program` | `[["program_type","=","coupons"]]` |
| Abonnements | `sale.order` | `[["is_subscription","=",true]]` (v16+ avec module subscription) |
| Commandes récurrentes | `sale.temporal.recurrence` | — |

**Champs clés `sale.order` :**
- `state` : draft / sent / sale / done / cancel
- `amount_total` / `amount_untaxed` / `amount_tax`
- `invoice_status` : nothing / to invoice / invoiced
- `delivery_status` : nothing / waiting / partial / full (si stock installé)
- `commitment_date` : date de livraison promise
- `date_order` : date de confirmation

**Champs clés `crm.lead` :**
- `type` : lead / opportunity
- `stage_id` : étape du pipeline
- `probability` : probabilité de conversion (0–100)
- `expected_revenue` : montant prévu
- `date_deadline` : date limite
- `user_id` : commercial assigné
- `partner_id` : client (peut être null pour un lead)

### Achats

| Besoin | Modèle | Domain clé |
|--------|--------|-----------|
| Bons de commande | `purchase.order` | `[["state","in",["purchase","done"]]]` |
| Appels d'offres | `purchase.order` | `[["state","in",["draft","sent","to approve"]]]` |
| Lignes de commande achat | `purchase.order.line` | — |
| Fournisseurs produit | `product.supplierinfo` | `[["partner_id","=",X]]` |
| Incoterms | `account.incoterms` | — |

**Champs clés `purchase.order` :**
- `state` : draft / sent / to approve / purchase / done / cancel
- `invoice_status` : nothing / to invoice / invoiced
- `date_approve` : date de confirmation fournisseur

### Stock & Logistique

| Besoin | Modèle | Domain clé |
|--------|--------|-----------|
| Mouvements de stock | `stock.move` | `[["state","=","done"]]` pour réalisés |
| Détail mouvements | `stock.move.line` | `[["state","=","done"]]` |
| Transferts | `stock.picking` | `[["state","in",["ready","assigned","waiting"]]]` |
| Stock physique | `stock.quant` | `[["location_id.usage","=","internal"]]` |
| Emplacements | `stock.location` | `[["usage","=","internal"],["active","=",true]]` |
| Entrepôts | `stock.warehouse` | — |
| Routes | `stock.route` | — (v17+), `stock.location.route` (≤v16) |
| Règles de réappro | `stock.warehouse.orderpoint` | — |
| Lots / Numéros de série | `stock.lot` | `[["product_id","=",X]]` |
| Packages | `stock.quant.package` | — |
| Catégories de stock | `product.category` | — |
| Types d'opération | `stock.picking.type` | `[["code","in",["incoming","outgoing","internal"]]]` |
| Inventaires ajustements | `stock.inventory` (≤v16), `stock.quant` (v17+) | — |

**Champs clés `stock.move` :**
- `state` : draft / waiting / confirmed / partially_available / assigned / done / cancel
- `product_id`, `product_uom_qty` (quantité demandée), `quantity_done` (réalisée)
- `location_id` (source), `location_dest_id` (destination)
- `origin` : référence source (commande, OF, etc.)

**Diagnostics stock courants :**
- Stock négatif : `stock.quant` avec `quantity < 0`
- Transferts bloqués : `stock.picking` avec `state = 'assigned'` et `scheduled_date < now`
- Mouvements orphelins : `stock.move` avec `state = 'confirmed'` sans `picking_id`
- Lots sans traçabilité : `stock.lot` sans `stock.move.line` associés

### Ressources Humaines & Paie

| Besoin | Modèle | Domain clé |
|--------|--------|-----------|
| Employés actifs | `hr.employee` | `[["active","=",true]]` |
| Contrats | `hr.contract` | `[["state","=","open"]]` pour actifs |
| Congés (demandes) | `hr.leave` | `[["holiday_status_id","=",X],["state","=","validate"]]` |
| Allocations congés | `hr.leave.allocation` | `[["state","=","validate"]]` |
| Soldes congés | `hr.leave.report` | — |
| Présences | `hr.attendance` | `[["employee_id","=",X],["check_out","=",false]]` pour présences ouvertes |
| Fiches de paie | `hr.payslip` | `[["state","=","done"]]` |
| Lots de paie | `hr.payslip.run` | — |
| Candidatures | `hr.applicant` | `[["stage_id.name","=","New"]]` |
| Postes | `hr.job` | — |
| Départements | `hr.department` | — |
| Certifications/Compétences | `hr.employee.skill` | — |

**Diagnostics RH courants :**
- Présences non clôturées : `hr.attendance` avec `check_out = False`
- Soldes congés négatifs : `hr.leave.allocation` avec `number_of_days < 0`
- Contrats expirés sans successeur : `hr.contract` avec `state='open'` et `date_end < today`
- Employés sans contrat actif : `hr.employee` sans `hr.contract` en state=open

### Projets & Timesheets

| Besoin | Modèle | Domain clé |
|--------|--------|-----------|
| Projets | `project.project` | `[["active","=",true]]` |
| Tâches | `project.task` | `[["stage_id.fold","=",false]]` pour non-archivées |
| Timesheets | `account.analytic.line` | `[["project_id","!=",false],["employee_id","!=",false]]` |
| Jalons | `project.milestone` | — |
| Sous-tâches | `project.task` | `[["parent_id","!=",false]]` |

**Champs clés `project.task` :**
- `stage_id` : étape (kanban)
- `date_deadline` : échéance
- `user_ids` (v17+) ou `user_id` (≤v16) : assigné(s)
- `planned_hours` : heures planifiées
- `effective_hours` : timesheets réalisées
- `remaining_hours` : restant
- `state` : normal / done / cancelled (v17+)

### Fabrication (MRP)

| Besoin | Modèle | Domain clé |
|--------|--------|-----------|
| Ordres de fabrication | `mrp.production` | `[["state","in",["confirmed","progress","to_close"]]]` |
| Nomenclatures | `mrp.bom` | `[["active","=",true]]` |
| Composants BOM | `mrp.bom.line` | — |
| Ordres de travail | `mrp.workorder` | `[["state","in",["ready","progress"]]]` |
| Postes de charge | `mrp.workcenter` | — |
| Plan directeur | `mrp.production.schedule` | — |
| Sous-produits | `mrp.bom.byproduct` | — |

**Champs clés `mrp.production` :**
- `state` : draft / confirmed / progress / to_close / done / cancel
- `product_id`, `product_qty`, `qty_producing`
- `date_planned_start`, `date_planned_finished`
- `bom_id` : nomenclature utilisée

### eCommerce & Site Web

| Besoin | Modèle | Domain clé |
|--------|--------|-----------|
| Produits publiés | `product.template` | `[["is_published","=",true]]` |
| Commandes web | `sale.order` | `[["website_id","!=",false]]` |
| Sessions panier | `website.visitor` | — |
| Paniers abandonnés | `sale.order` | `[["state","=","draft"],["website_id","!=",false],["cart_recovery_email_sent","=",false]]` |
| Pages web | `website.page` | — |
| Menus | `website.menu` | — |

### Point de Vente (POS)

| Besoin | Modèle | Domain clé |
|--------|--------|-----------|
| Sessions POS | `pos.session` | `[["state","=","opened"]]` pour sessions actives |
| Commandes POS | `pos.order` | `[["state","in",["paid","done","invoiced"]]]` |
| Lignes POS | `pos.order.line` | — |
| Configurations POS | `pos.config` | `[["active","=",true]]` |
| Paiements POS | `pos.payment` | — |

---

## Modèles transversaux essentiels

| Modèle | Usage |
|--------|-------|
| `res.partner` | Clients (`customer_rank > 0`), fournisseurs (`supplier_rank > 0`), contacts |
| `res.users` | Utilisateurs internes (`share=False`), portail (`share=True`) |
| `res.company` | Sociétés (multi-company) |
| `res.currency` | Devises |
| `product.template` | Fiche produit (côté commercial) |
| `product.product` | Variante produit (côté stock/technique) |
| `product.category` | Catégories produits |
| `product.attribute` | Attributs (couleur, taille...) |
| `uom.uom` | Unités de mesure |
| `mail.message` | Messages, notes, logs des chatter |
| `mail.activity` | Activités planifiées |
| `mail.followers` | Abonnés aux documents |
| `ir.attachment` | Pièces jointes |
| `ir.rule` | Règles d'accès par enregistrement |
| `ir.model.access` | Droits d'accès par groupe |
| `res.groups` | Groupes de sécurité |

---

## Patterns de diagnostic avancés

### Comptabilité
```
# Factures impayées depuis > 90 jours
account.move | [["payment_state","not in",["paid","in_payment"]], ["invoice_date_due","<","<date_90j>"], ["state","=","posted"], ["move_type","in",["out_invoice"]]]
champs: name, partner_id, invoice_date_due, amount_residual, currency_id

# Doublons de paiement suspects (même partenaire, même montant, même période)
account.payment | [["state","=","posted"]] | grouper par partner_id + amount + date_tronquée

# Écritures sans lettrage sur comptes de tiers
account.move.line | [["account_id.reconcile","=",true], ["reconciled","=",false], ["balance","!=",0]]

# Journaux avec solde non nul en espèces
account.journal | [["type","=","cash"]] → vérifier balance via account.move.line
```

### Stock
```
# Produits sous le seuil de réapprovisionnement
stock.warehouse.orderpoint | [["qty_on_hand","<=","product_min_qty"]]
champs: product_id, product_min_qty, product_max_qty, qty_on_hand, qty_to_order

# Transferts non traités depuis > 7 jours
stock.picking | [["state","in",["confirmed","assigned"]], ["scheduled_date","<","<date_7j>"]]
champs: name, picking_type_id, partner_id, scheduled_date, state

# Valorisation du stock par catégorie
stock.quant | [["location_id.usage","=","internal"]]
champs: product_id, product_id.categ_id, quantity, product_id.standard_price
→ calculer quantity * standard_price côté client
```

### Ventes & CRM
```
# Commandes livrées non facturées
sale.order | [["invoice_status","=","to invoice"], ["state","=","sale"]]
champs: name, partner_id, date_order, amount_total, user_id

# Opportunités sans activité depuis > 30 jours
crm.lead | [["type","=","opportunity"], ["active","=",true]]
→ vérifier mail.activity ou date de dernière mise à jour (write_date)

# CA par commercial sur les 3 derniers mois
sale.order | [["state","in",["sale","done"]], ["date_order",">=","<date_3m>"]]
champs: user_id, amount_untaxed → grouper/agréger côté client

# Pipeline CRM : valeur pondérée
crm.lead | [["type","=","opportunity"], ["active","=",true]]
champs: name, partner_id, expected_revenue, probability, stage_id, user_id
→ valeur_pondérée = expected_revenue * probability / 100
```

### RH
```
# Présences non clôturées (employés "pointés" sans sortie)
hr.attendance | [["check_out","=",false]]
champs: employee_id, check_in, check_out

# Soldes de congés par type
hr.leave.allocation | [["state","=","validate"], ["holiday_status_id","=",X]]
champs: employee_id, number_of_days, date_from, date_to

# Fiches de paie brouillon du mois en cours
hr.payslip | [["state","in",["draft","verify"]], ["date_from",">=","<début_mois>"]]
champs: employee_id, date_from, date_to, struct_id
```

---

## Règles de sécurité et droits d'accès

### Groupes standards importants
- `base.group_user` : utilisateur interne (base)
- `base.group_portal` : utilisateur portail
- `account.group_account_user` : comptable
- `account.group_account_manager` : responsable comptabilité
- `sale.group_sale_salesman` : commercial
- `sale.group_sale_manager` : responsable ventes
- `purchase.group_purchase_user` : acheteur
- `stock.group_stock_user` : opérateur stock
- `stock.group_stock_manager` : responsable stock
- `mrp.group_mrp_user` : opérateur fabrication
- `hr.group_hr_user` : responsable RH
- `project.group_project_user` : utilisateur projet

### Vérification droits
```python
# Modèles pour auditer les droits
ir.model.access | [["model_id.model","=","account.move"]]  # droits CRUD sur factures
ir.rule         | [["model_id.model","=","sale.order"]]    # règles d'accès par enregistrement
res.groups.users_rel                                        # appartenance groupes/utilisateurs
```

---

## Customisations : comment les repérer

### Signaux d'un module custom
- Modèles avec préfixe non-standard (ex: `x_`, `custom_`, nom_societe_)
- Champs `x_*` sur les modèles standards (ajoutés via Studio ou code)
- Modules dans `ir.module.module` avec `author != 'Odoo S.A.'` et `state = 'installed'`
- Vues dans `ir.ui.view` avec `type = 'custom'` ou `inherit_id` non-nul + module custom

```
# Lister les modules tiers installés
ir.module.module | [["state","=","installed"], ["author","!=","Odoo S.A."], ["author","!=","Odoo"]]
champs: name, summary, author, installed_version

# Champs ajoutés via Studio
ir.model.fields | [["name","like","x_studio"], ["state","=","manual"]]
```

---

## Performance & Optimisation

### Diagnostics lenteur fréquents
- Trop d'enregistrements dans `mail.message` : vérifier les modèles avec `subtype_ids` actifs
- Indices manquants : `stock.move.line` sans index sur `lot_id` ou `package_id`
- `res.partner` avec `parent_id` : éviter les domaines sans `["is_company","=",true]` sur de grosses bases
- `account.move.line` : toujours filtrer sur `move_id.state = 'posted'` pour les rapports

### Requêtes à éviter
- Ne jamais chercher dans `ir.attachment` sans filtrer sur `res_model` (table énorme)
- `mail.message` sans filtre `res_id` ou `res_model` = requête catastrophique
- `stock.move` sans filtre `state` = renvoie des milliers d'entrées inutiles

---

## Workflow des statuts — Référence rapide

| Document | États (dans l'ordre) |
|----------|---------------------|
| Devis → Commande | draft → sent → sale → done / cancel |
| Facture | draft → posted → (cancel) |
| Paiement facture | not_paid → partial → in_payment → paid |
| Transfert stock | draft → waiting → confirmed → assigned → done / cancel |
| OF fabrication | draft → confirmed → progress → to_close → done / cancel |
| Congé RH | draft → confirm → validate1 → validate / refuse |
| Fiche de paie | draft → verify → done / cancel |
| Bon de commande | draft → sent → to approve → purchase → done / cancel |
| Opportunité CRM | (stage libre) + `active=True` → `active=False` (archivé/perdu) |

---

## Bonnes pratiques d'analyse client

### Avant un audit
1. Vérifier la version exacte : `ir.module.module` où `name='base'` → champ `installed_version`
2. Lister les modules tiers : potentiel de customisation
3. Identifier la taille de la base : compter `account.move`, `sale.order`, `stock.move`
4. Vérifier les multi-sociétés : `res.company` count > 1 → comportements différents

### Lors du diagnostic
1. Toujours partir des données réelles (ne pas supposer)
2. Vérifier les `active=False` : beaucoup de modèles Odoo ont des enregistrements archivés invisibles
3. Multi-currency : vérifier `currency_id` sur les montants — `amount_residual_currency` ≠ `amount_residual`
4. Sociétés multiples : les `ir.rule` filtrent souvent par `company_id` — penser à vérifier

### Anomalies à chercher systématiquement
- Factures en état `draft` depuis > 30 jours (oubliées de valider)
- `sale.order` en état `sale` non facturées depuis > 15 jours
- `stock.picking` bloqués depuis > 7 jours
- Utilisateurs avec droits `base.group_system` non justifiés
- `res.partner` doublons : même `email` ou même `vat` sur plusieurs enregistrements
- Produits avec `standard_price = 0` dans une valorisation au coût réel
"""

_MEETING_MINUTE_MD = """\
# Modèle de compte-rendu de réunion

Quand on te demande de générer un compte-rendu de réunion, utilise ce modèle.
Adapte les sections au contenu réel de la conversation — supprime les sections vides.

## Règles de génération
- Ne pas inventer de participant, décision, échéance ou responsable.
- Si une information manque, écrire `À confirmer` plutôt que combler.
- Transformer les échanges longs en décisions, risques, questions ouvertes et actions concrètes.
- Garder un style professionnel, factuel, sans commentaire sur la qualité de la réunion.
- Si la conversation contient des désaccords, les résumer comme points à arbitrer.

---

# Compte-rendu de réunion — [Sujet principal]

**Date :** [date de la réunion]
**Durée :** [durée approximative]
**Lieu / Canal :** [présentiel / Teams / Zoom / etc.]

**Participants :**
- [Prénom Nom] — [Rôle]
- [Prénom Nom] — [Rôle]

**Rédigé par :** [Nom du consultant]

---

## 1. Contexte et objectif de la réunion

[Brève description du contexte et de ce qui était attendu de cette réunion]

---

## 2. Points discutés

### 2.1 [Premier sujet]
[Résumé des échanges, informations partagées, problèmes soulevés]

### 2.2 [Deuxième sujet]
[Résumé des échanges]

---

## 3. Décisions prises

| # | Décision | Décideur |
|---|----------|---------|
| 1 | [Description de la décision] | [Nom] |
| 2 | [Description de la décision] | [Nom] |

---

## 4. Actions de suivi

| # | Action | Responsable | Échéance | Statut |
|---|--------|-------------|---------|--------|
| 1 | [Description de l'action] | [Nom] | [Date] | À faire |
| 2 | [Description de l'action] | [Nom] | [Date] | À faire |

---

## 5. Points en suspens / Questions ouvertes

- [Question ou point qui nécessite un suivi ou une clarification]
- [Point bloquant identifié]

---

## 6. Prochaines étapes

- **Prochaine réunion :** [date prévue ou "à définir"]
- **Ordre du jour prévu :** [sujets à aborder]

---

*Compte-rendu généré par Odoo Consultant Portal*
"""

_MIGRATION_MD = """\
# Méthodologie de migration Odoo

> Ce document sert de **référentiel commun** pour répondre à toute question de migration,
> que la perspective soit **fonctionnelle (AM/BA)** ou **technique (Archi/Dev)**.
> Adapte la profondeur et le vocabulaire à la perspective active : reste sur le métier
> (parcours, processus, modules, conduite du changement) en mode fonctionnel ; descends
> dans le code (ORM, vues, hooks) en mode technique. Mais raisonne **toujours** sur les
> deux dimensions avant de répondre.
>
> Priorité : les sources et le dépôt client priment sur cette méthodologie. Si un exemple
> ci-dessous ne correspond pas au code local, mentionne l'écart et base la réponse sur le code.

## Rôle de l'assistant en mode migration
Aider le consultant à **cadrer, sécuriser et exécuter** une migration Odoo en couvrant
trois dimensions :
1. **Métier / fonctionnel** : ce que les utilisateurs vont gagner, perdre, refaire ou réapprendre.
2. **Applicatif / paramétrage** : modules à activer, désactiver, remplacer ; configurations à reprendre.
3. **Technique** : modules custom, données, performance, infrastructure, breaking changes du framework.

## Contrat de réponse en migration
- Commencer par le risque principal ou l'opportunité principale.
- Toujours distinguer : **standard Odoo**, **custom client**, **donnée à migrer**, **configuration à reprendre**.
- En mode AM/BA : traduire les changements en impacts utilisateurs, formation et arbitrages.
- En mode Archi/Dev : citer modèles, champs, fichiers, hooks, scripts ou commandes à modifier.
- Terminer par 3 actions maximum : audit, correction, test ou décision.

---

## 1. Cadrage de la migration (questions à se poser systématiquement)

### Côté métier
- Quels processus métier sont **critiques** pour ce client (ventes, achats, stock, finance, RH, projet, MRP) ?
- Quels **modules standard** sont activés aujourd'hui ? Lesquels sont **fortement personnalisés** ?
- Quelles sont les **intégrations** externes (paiement, marketplace, EDI, banque, BI, e-commerce, IoT) ?
- Quels sont les **utilisateurs clés** (key users) à embarquer ? Combien d'utilisateurs au total ?
- Y a-t-il des **contraintes calendaires** (clôture comptable, saison commerciale, fin d'exercice, paie) ?

### Côté technique
- Version source / version cible exactes (pas seulement la majeure : 17.2, 17.5, etc.).
- Modules custom : développés en interne, par un partenaire, par OCA, modules tiers payants.
- Volume de données : factures, commandes, stock, historique → impact sur durée de migration.
- Infrastructure : on-premise / Odoo.sh / Odoo Online — chacun a ses contraintes.
- Prérequis techniques de la version cible (PostgreSQL, Python) — voir tableau breaking changes.

### Côté projet
- Budget et délai disponibles.
- Stratégie de bascule : **big bang** vs **migration progressive par société/module**.
- Disponibilité des key users pour la recette.
- Engagement de la direction (sponsor) — indispensable.

---

## 2. Phases de migration (cycle complet)

| Phase | Livrable principal | Qui contribue |
|---|---|---|
| **Audit** | Cartographie modules + customs + intégrations + volumes | AM + Dev |
| **Cadrage** | Périmètre, scénarios cibles, estimation, planning | AM + chef de projet |
| **Migration technique** | Base de données et modules custom migrés sur env de test | Dev / DBA |
| **Recette fonctionnelle** | PV de recette par processus métier | AM + key users |
| **Conduite du changement** | Formation, communication, FAQ, supports | AM + RH |
| **Bascule production** | Cutover plan, gel des données, go/no-go | Tous |
| **Hypercare** | Support renforcé J+1 à J+30 | AM + Dev |

---

## 3. Analyse fonctionnelle d'une migration (perspective AM / BA)

### Ce qu'il faut produire
- **Liste des nouvelles fonctionnalités standard** apportées par la version cible (par domaine métier).
- **Liste des fonctionnalités dépréciées ou remplacées** (ex : Membership → Partnership en v19).
- **Liste des modules custom potentiellement obsolètes** : un module standard de la cible répond-il déjà au besoin ?
- **Impact UX** : menus déplacés, écrans refondus, terminologie qui change.
- **Impact processus** : workflow modifié, étapes en plus / en moins, automatisations standard supplémentaires.
- **Impact rôles** : qui doit être formé, sur quoi, à quel niveau.

### Format de restitution recommandé (fonctionnel)
| Domaine | Fonctionnalité | vSource | vCible | Bénéfice utilisateur | Action AM | Effort |
|---|---|---|---|---|---|---|
| Ventes | Produits combo | manquant | natif | Vente packs guidée | Refondre articles "menu" | M |
| RH | Pay Runs | lots de fiches | interface guidée | Paie plus rapide | Reformer paie | F |

### Indicateurs d'effort à proposer
- **F (Faible)** : config simple, peu de formation
- **M (Moyen)** : reprise de paramétrage, formation key users
- **É (Élevé)** : refonte de processus, formation large, communication structurée

### Conduite du changement (à ne jamais oublier)
- **Communication** : annonce, calendrier, bénéfices attendus
- **Formation** : key users d'abord, puis cascade utilisateurs finaux
- **Documentation** : FAQ, captures d'écran "avant/après", procédures rejouables
- **Sponsor** : un leader métier visible et engagé
- **Hypercare** : canal dédié post go-live, daily debrief les 2 premières semaines

---

## 4. Analyse technique d'une migration (perspective Archi / Dev)

### Ce qu'il faut produire
- Liste des modules custom et leur compatibilité (à porter / à réécrire / à abandonner).
- Liste des breaking changes du framework qui touchent les customs (ORM, vues, hooks).
- Stratégie de migration des données (scripts, mapping, jeux de tests).
- Plan d'infrastructure (PostgreSQL, Python, dépendances système).
- Plan de tests automatisés (pytest, tour, hoot).

### Inventaire technique à dresser systématiquement
- [ ] Modules custom : `ir.module.module` filtré par auteur ≠ Odoo
- [ ] Champs custom : `ir.model.fields` avec `state='manual'`
- [ ] Vues custom : `ir.ui.view` rattachées à des modules custom
- [ ] Actions serveur custom : `ir.actions.server`
- [ ] Règles d'accès custom : `ir.rule`
- [ ] Crons custom : `ir.cron`
- [ ] Webhooks et endpoints custom (contrôleurs)
- [ ] Données de référence custom (`noupdate=1`)

### Format de restitution recommandé (technique)
| Élément | vSource | vCible | Action requise | Risque |
|---|---|---|---|---|
| `attrs="..."` dans vues | OK v16 | supprimé v17 | Réécrire en `invisible="..."` | Bloquant |
| `name_get()` | OK v16 | déprécié v17, supprimé v18 | Migrer vers `_compute_display_name` | Important |

### Breaking changes majeurs par version

#### v16 → v17 (le plus impactant)
- `attrs="{'invisible': [...]}"` → `invisible="state == 'draft'"` (toutes les vues XML)
- `name_get()` → `_compute_display_name()`
- `(0, 0, {...})` → `Command.create({...})` (manipulations O2M/M2M)
- `read_group()` retourne des tuples, non des dicts
- `<tree>` → `<list>` dans toutes les vues liste
- `stock.location.route` → `stock.route`
- `post_init_hook(cr, registry)` → `post_init_hook(env)`
- SCSS `@import` → `@use` / `@forward`

#### v17 → v18
- `name_get()` officiellement dépréciée (utiliser `display_name`)
- Nouvelles méthodes contrôle d'accès : `check_access()`, `has_access()`, `_filtered_access()`
- URLs lisibles : `/odoo/model/id` (impacte les contrôleurs custom)
- `datetime.utcnow()` → `datetime.now(timezone.utc)` (Python 3.12)
- CSP renforcée : pas de scripts inline, pas de CDN externe sans whitelist

#### v18 → v19
- **PostgreSQL 13 minimum strict** (bloquant si PG 12)
- Module **Membership** → **Partnership** (toute personnalisation à porter)
- Python 3.11 minimum pour certains modules
- Module Equity, ESG, AI, 40+ packs industrie disponibles

---

## 5. Stratégie de bascule (cutover)

### Big bang (tout d'un coup)
- ✅ Plus simple à orchestrer, communication unique
- ❌ Risque concentré sur un weekend, rollback complexe
- Recommandé pour PME / mono-société / volumes raisonnables

### Progressif (par société, par module, par site)
- ✅ Risque réparti, retour d'expérience exploitable
- ❌ Coexistence v-source / v-cible pendant des semaines, doubles saisies possibles
- Recommandé pour groupes multi-sociétés ou modules très critiques

### Plan de cutover type
1. **J-30** : freeze des développements
2. **J-7** : recette finale, formation key users, gel des configurations
3. **J-2** : dernière sauvegarde de référence
4. **J-1** : gel des saisies métier (sauf urgences), bascule technique de nuit
5. **J0** : go-live + équipe support sur place
6. **J+1 à J+15** : hypercare quotidien
7. **J+30** : bilan post-migration, capitalisation

---

## 6. Risques fréquents (à toujours évoquer)

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Module custom incompatible | Élevée | Élevé | Audit en amont + porter ou remplacer |
| Données corrompues / doublons | Moyenne | Élevé | Nettoyage avant migration |
| Performances dégradées en prod | Moyenne | Moyen | Tester sur copie taille réelle |
| Rejet utilisateurs (UX) | Élevée | Moyen | Formation + communication + hypercare |
| Intégrations cassées | Moyenne | Élevé | Tests end-to-end avant go-live |
| Reporting custom à refaire | Élevée | Moyen | Inventaire des rapports existants |

---

## 7. Outils disponibles pour l'analyse
- `search_odoo_source` / `read_odoo_file` : code de la **version source**
- `search_target_source` / `read_target_file` : code de la **version cible**
- `search_project_source` / `read_project_file` : code des **modules custom du client**
- `count_source_lines(scope, path?, file_types?, group_by?)` : **comptage exhaustif** de lignes/fichiers
  (par module, extension ou dossier). Utilise-le pour toute question de volumétrie — jamais déduire du nombre de matches d'une recherche grep.
- `query_odoo` / `count_odoo` / `get_odoo_fields` : interroger l'instance client si connectée

### Règles d'usage pour répondre
- **Toujours** chercher dans le code avant d'affirmer (jamais d'invention).
- **Croiser** source ↔ cible pour toute comparaison.
- **Vérifier** les modules custom du client si le repo est disponible.
- **Citer** le fichier et la ligne quand tu donnes un changement précis.
- En perspective fonctionnelle : privilégier les fichiers `views/`, `wizard/`, `report/`,
  `data/` et `__manifest__.py` (description, category, dépendances) plutôt que le Python brut.
- En perspective technique : descendre dans `models/`, `controllers/`, `static/`, hooks de modules.

## 8. Format de restitution
- Toujours **classer les sujets par criticité** : 🔴 Bloquant / 🟠 Important / 🟡 Mineur
- **Tableaux Markdown** pour les comparaisons (jamais de prose dense)
- **Snippets de code** uniquement en perspective technique
- **Captures de navigation** (`Ventes → Configuration → ...`) en perspective fonctionnelle
- Toujours terminer par les **prochaines étapes recommandées** (3 actions max)
"""

_STUDIO_MD = """\
# Inspection Studio — Guide pour l'assistant

## Rôle de l'outil `inspect_studio`

Quand l'utilisateur demande ce qui a été fait via Studio, quels champs/modèles/vues existent,
ou veut comprendre les personnalisations de l'instance, utilise **toujours** `inspect_studio`
avant de répondre. Ne suppose jamais ce qui a été personnalisé sans interroger l'instance.

## Qualité attendue de l'analyse
- Séparer les faits retournés par `inspect_studio` des interprétations.
- Relier chaque personnalisation à son **impact métier** et à son **risque technique**.
- Ne pas conclure qu'une personnalisation est inutile sans vérifier le processus métier concerné.
- En migration, classer les éléments en : à conserver, à remplacer par standard, à refaire, à supprimer.
- Si le volume est élevé, commencer par les modèles et vues qui touchent `sale`, `account`, `stock`, `project`, `hr` ou les modèles `x_*`.

## Conventions de nommage Odoo Studio

| Élément            | Convention technique                            | Exemples                                          |
|--------------------|-------------------------------------------------|---------------------------------------------------|
| Modèles custom     | `x_<nom_snake>` (state='manual')                | `x_projet_chantier`, `x_devis_complementaire`    |
| Champs custom      | `x_<nom>` ou `x_studio_<nom>` (state='manual') | `x_garantie`, `x_studio_ref_interne`             |
| Vues Studio        | clé `studio_customization.<hash>`               | overlay sur une vue standard                     |
| Menus Studio       | module `studio_customization` dans ir.model.data | —                                               |
| Actions serveur    | liées à un binding_model, binding_type='action' | bouton dans la vue                               |
| Automatisations    | `base.automation`, trigger: record_write, etc.  | calcul auto, notification, changement d'état     |

## Méthode d'inspection recommandée

1. **Inventaire complet** → `inspect_studio(sections=['all'])` — vue d'ensemble rapide
2. **Focus données** → `inspect_studio(sections=['models', 'fields'])` — objets métier créés
3. **Focus interface** → `inspect_studio(sections=['views', 'menus'])` — écrans modifiés
4. **Focus logique** → `inspect_studio(sections=['server_actions', 'cron', 'automations'])` — automatisations
5. **Filtrer par app** → `inspect_studio(sections=['fields'], model_filter='sale.')` — champs custom sur les ventes

## Format de restitution conseillé

```
## Personnalisations Studio détectées

### Modèles custom (N)
| Modèle technique  | Nom fonctionnel | Transitoire |
|-------------------|-----------------|-------------|
| x_projet_chantier | Projet chantier | Non         |

### Champs custom par modèle (N total)
#### sale.order (N champs)
| Champ technique   | Libellé         | Type    | Stocké | Requis |
|-------------------|-----------------|---------|--------|--------|
| x_garantie        | Garantie (mois) | integer | Oui    | Non    |

### Vues modifiées (N)
| Nom | Modèle | Type |

### Actions serveur (N) / Actions planifiées (N) / Automatisations (N)
...
```

## Impact migration — points d'attention

- **Modèles custom** (`state='manual'`) : à recréer en version cible — évaluer si un modèle standard couvre le besoin
- **Champs custom** : réévaluer pertinence (certains peuvent devenir standard en vX+)
- **Vues Studio** : souvent **incompatibles** entre versions majeures — à retester intégralement
- **Automatisations** : les triggers ont changé entre v15→v16 (renommage), v16→v17 — à vérifier
- **Actions serveur** : compatibilité du code Python embarqué avec la nouvelle version ORM
- **Règles d'accès** : les groupes peuvent avoir changé de nom ou disparu

## Signaux d'alerte à mentionner

- Modèles custom avec `transient=True` → wizards temporaires, impact performance si mal gérés
- Champs `compute` sans `store=True` → recalcul à chaque accès, potentiel goulot d'étranglement
- Vues overlay sur des vues core Odoo (sale, account…) → risque de régression après mise à jour
- Crons actifs avec fréquence élevée (toutes les heures) → vérifier l'utilité et l'impact
"""

_VERSION_NOTES: dict = {

"19.0": """\
# Odoo 19.0

**Date de sortie :** Septembre 2025 (Odoo Experience 2025)

## Prérequis techniques
- **Python :** 3.10 minimum, **3.11 recommandé**
- **PostgreSQL : 13.0 minimum** (rupture — PG 12 non supporté)
- PostgreSQL 14+ recommandé pour les performances

## Nouveaux modules
- **Equity** — suivi des parts, actionnaires et bénéficiaires (cabinets comptables et fiduciaires)
- **ESG (Environmental, Social, Governance)** — empreinte carbone intégrée RH/Paie, reporting Scope 3 automatique depuis les données factures, conformité CSRD
- **Partnership** — remplace le module Membership ; gestion des grades, listes de prix et programmes partenaires
- **Module AI** — framework d'agents IA pour requêtes en langage naturel et actions sur la base de données
- **40+ packs industrie** (modules données sans code Python) : cabinet comptable, boulangerie, charpentier, traiteur, salle de concert, construction, cosmétiques, coworking, électricien, escape rooms, food truck, galerie, hôtel, HVAC, bibliothèque, location machines, thérapie, boîte de nuit, coach sportif, immobilier, spa, tatouage, théâtre, vétérinaire, cave à vin, yoga, etc.

## Suppressions / remplacements
- Module **Membership** → remplacé par **Partnership**

## Comptabilité
- Rapprochement bancaire : réconciliation sur écritures brouillon
- États financiers annuels : rapport composite bilan + P&L
- Déclaration fiscale avec validation automatique
- Catégories fiscales déplacées des catégories vers les comptes
- Escomptes de caisse : option "Toujours (à la facturation)"
- Paiements ISO20022 avec identifiant End-to-End
- Relances clients via WhatsApp

## Ventes & CRM
- Prédiction probabilité de leads par IA
- Scan de cartes de visite pour création de leads
- Produits optionnels éditables dans le portail client
- Paiements partiels dans le portail utilisateur
- Intégrations marketplaces : Amazon Ireland, Shopee, Gelato

## Stock & Logistique
- Plusieurs routes par ligne de commande (ex: MTO + Buy simultanément)
- Packages dans packages (emballages imbriqués)
- Règles de réappro : paramètre horizon avec champ date limite
- Notifications d'expédition WhatsApp
- Améliorations prévision de la demande MPS

## Fabrication
- **Vue Gantt pour les ordres de fabrication** (planification visuelle)
- Taille de lot par défaut sur les nomenclatures
- Plusieurs numéros de série/lot par ordre de fabrication
- Coût employé par poste de charge impacte la valorisation
- Statut des opérations de travail éditable

## Ressources Humaines
- Contrats fusionnés avec mécanisme de versioning (historique en un seul enregistrement)
- **Pay Runs** remplace les lots de fiches de paie (interface guidée)
- Plusieurs comptes bancaires par employé avec split du net salarial
- Module LMS de base (Learning Management System)
- Réserve de talents remplace le système de candidats
- Travail à distance activé par défaut

## Projets
- Templates de projets avec tâches pré-remplies
- Vue Gantt pour tâches du portail
- Niveaux de priorité multiples
- Planification auto sur planning flexible

## eCommerce / Site Web
- Synchronisation produits Google Merchant Center
- Widget stock Click & Collect
- Pagination SEO améliorée
- Génération de pages web depuis prompts IA

## Technique / ORM
- **PostgreSQL 13 est le minimum strict** — bases PG 12 doivent migrer avant upgrade v19
- Python 3.11 requis pour certains modules
- Modification de masse incrémentale : opérateurs `+=`, `-=`, `*=`, `/=` sur les champs
- Données en cache et traductions pour navigation plus rapide
- Autocomplétion partenaires via Dun & Bradstreet

## Points de vigilance migration v18 → v19
- **Blocker : PostgreSQL doit être ≥ 13** avant migration (vérifier avec `SELECT version()` en base)
- Module Membership → Partnership : toute personnalisation sur `membership.line`, `membership.membership_line`, `product.template` (lié membership) doit être portée ou retirée
- Vérifier compatibilité Python 3.11 pour les modules custom (tester en environnement de staging)
- Pay Runs remplace `hr.payslip.run` : vérifier les intégrations et rapports custom sur les lots de paie

## Pour le consultant
- **ESG/CSRD** : le module ESG répond à la directive européenne CSRD (Corporate Sustainability Reporting Directive, obligatoire pour les grandes entreprises en UE dès 2024–2026 selon taille). Excellent argument de vente pour les grands comptes européens.
- **Module AI** : positionné comme copilote natif (requêtes en langage naturel sur les données, suggestions d'actions) — à distinguer des intégrations IA des versions précédentes (ChatGPT pour texte web en v17).
- **Packs industrie** : modules de données (pas de code Python), installables facilement et modifiables via Studio — idéaux pour accélérer les démos sectorielles.
- **Vérification PostgreSQL avant projet d'upgrade** : `SELECT version();` en base pour confirmer la version PG.
""",

"18.0": """\
# Odoo 18.0

**Date de sortie :** 2–4 Octobre 2024 (Odoo Experience 2024, Brussels Expo)

## Prérequis techniques
- **Python :** 3.10 minimum (3.12 recommandé pour +10–60% de performance)
- **PostgreSQL :** 12.0 minimum (15 recommandé)
- Note : Python 3.12 déprécié `datetime.utcnow()` → utiliser `datetime.now(timezone.utc)` ; module `distutils` supprimé

## Nouveaux modules
- **Sales Commissions** — gestion complète des commissions : cibles, règles par produit/catégorie/période, calcul sur marge/montant/quantité, dashboards prévision vs cible
- **Dispatch Management** — organisation des tournées de livraison avec flotte propre ou 3PL, vue carte, lots de prélèvements par véhicule, optimisation cross-docking
- Packs industrie étendus : Boulangerie, Food Truck, Nettoyage, Électricien, Agence Marketing, Activités outdoor

## Suppressions
- Providers paiement : Alipay, PayU Latam, PayUmoney supprimés
- Ogone et SIPS → remplacés par connecteur Worldline
- Connecteur eBay supprimé

## Comptabilité
- **Alertes factures anormales** (statistiques — détecte automatiquement montants/dates aberrants)
- Rapprochement bancaire : correspondance lots de paiements simplifiée
- Budgets analytiques redessinés : sans restriction de dates, affectation de plan flexible
- **Gestion des prêts** : calendrier d'amortissement automatique
- Intégration Peppol : envoi/réception de factures sur le réseau Peppol
- Matching PO/facture : écran avancé pour correspondance manuelle

## Ventes & CRM
- **Produits combo** : pack avec sélection par le client (style menu restaurant)
- EDI commandes : import PO par glisser-déposer avec pré-remplissage XML
- Intégration Gelato (impression à la demande)
- Templates de devis dynamiques : descriptions produits intégrées depuis template
- Export tarifs : PDF, CSV, XLSX
- CRM : CA attendu recalculé automatiquement à la confirmation du devis

## Stock
- Traçabilité lot/série inter-sociétés
- Règles pull-to-push : routes flexibles avec approvisionnement à la demande
- Valorisation par lot/série (coût séparé par unité de traçabilité)
- Putaway amélioré : dirige les produits vers emplacements déjà utilisés pour ce produit
- Système Dispatch Management (voir nouveaux modules)

## Fabrication
- MPS (Plan Directeur de Production) : planification annuelle, réapprovisionnement automatique, dimensionnement des lots
- Écritures de travaux en cours (WIP) : enregistrement consommation matières et main d'œuvre au bilan
- Assistant numéros de série pour production en masse revu

## Ressources Humaines
- Installation localisations automatique (modules paie pays auto-installés selon pays)
- Rôles de signature flexibles dans les contrats
- Suivi des effectifs par contrat à tout instant dans le temps
- Calcul année en cours avec date fin d'année personnalisable
- Feedback 360° : renvoi en lot

## Projets
- Plans analytiques directement sur les projets
- Graphique burn-up
- Utilisateurs portail : édition toutes tâches ou tâches suivies seulement
- Échéances tâches visibles dans le Gantt
- Historique des révisions de description de tâche (suivi + retour arrière)

## eCommerce / Site Web
- **Click & Collect** : vérification stock magasin avec sélection lieu de retrait
- Méga menus : navigation basée sur les catégories
- Pages de catégories personnalisables avec blocs de construction
- Contrôle d'accès boutique : restreindre `/shop` aux utilisateurs connectés
- 60+ nouveaux snippets site web
- 27+ thèmes redessinés
- Upload de polices personnalisées
- Authentification par **Passkeys** (WebAuthn)

## Point de vente
- Refonte complète interface POS
- Intégration AvaTax
- Paiements QR code (application bancaire)
- Création et édition produits depuis le POS
- Écran client sur n'importe quel appareil sans IoT box

## Technique / ORM
- **Nouvelles méthodes de contrôle d'accès** : `check_access()`, `has_access()`, `_filtered_access()` — unifie droits + règles
- `_search_display_name()` : recherche du display name via méthode dédiée
- `name_get()` **officiellement dépréciée** (dépréciée en v17, maintenant officielle)
- `_flush_search()` dépréciée — flush géré par `execute_query()` via SQL object
- Content Security Policy renforcée : pas de scripts inline, pas de CDN externe sans liste blanche
- URLs lisibles introduites : `/odoo/project/5/tasks` (affecte le routing des contrôleurs custom)
- Applications PWA mobiles : Barcode, POS, Présences, Kiosk, Desk d'accueil, Atelier

## Points de vigilance migration v17 → v18
- `name_get()` officiellement dépréciée : migrer vers `display_name` (toujours fonctionnel mais génère des warnings)
- `check_access()` / `has_access()` : tester les modules custom qui surchargeaient `check_access_rights()` ou `check_access_rule()` — comportement peut changer
- URLs lisibles `/odoo/model/id` : vérifier les redirections hardcodées dans les vues custom, les emails templates et les portails
- Python 3.12 : corriger `datetime.utcnow()` → `datetime.now(timezone.utc)` et supprimer tous imports `distutils`
- CSP renforcée : les widgets custom injectant du JavaScript inline ou chargeant depuis des CDN tiers échoueront

## Pour le consultant
- **Sales Commissions** : module Enterprise très attendu. Fonctionnement : objectifs (cibles) par commercial → règles par produit/catégorie/équipe → plans de commission → calcul automatique sur confirmé/facturé/payé. Remplace les solutions custom de commissions qui étaient quasi-universelles.
- **Dispatch Management** : distinct du module Fleet. Fleet = gestion du parc de véhicules. Dispatch = optimisation des tournées de livraison (grouper les pickings par route/véhicule). Nécessite le module stock + fleet pour fonctionner pleinement.
- **Click & Collect** : la configuration requiert le module eCommerce + stock + configuration des points de retrait (`stock.warehouse` avec option click & collect activée). Le client choisit le magasin lors du checkout.
- **Peppol (v17 et v18)** : réseau européen d'échange de factures B2B (obligatoire en Belgique depuis 2026 pour les marchés publics, en extension). Configuration via `account.edi.format` Peppol dans les journaux de vente.
""",

"17.0": """\
# Odoo 17.0

**Date de sortie :** Octobre–Novembre 2023 (Odoo Experience 2023)

## Prérequis techniques
- **Python :** 3.10 minimum (3.10, 3.11 supportés)
- **PostgreSQL :** 12.0 minimum
- **Framework JS :** OWL — gains de performance majeurs sur le rendu

## Nouveaux modules
- **Frontdesk** — gestion des visiteurs (borne de pointage, impression badges, notifications hôte)
- **Industries** — packs de données pré-configurés (Avocat, Bar, Coiffeur, etc.) ; pas de code Python
- **Check Management** — gestion des chèques propres et de tiers (Comptabilité)
- Module **To-Do** remplace l'ancien module Notes
- Export SD Worx pour la paie

## Comptabilité
- Rapports redessinés : sections drag-and-drop
- Assistant d'auto-réconciliation bancaire
- Facture : design épuré, montant total en lettres
- OCR synchrone : traitement 5× plus rapide
- **Intégration Peppol** : envoi/réception factures réseau Peppol
- **Comptes bancaires fournisseurs : validation obligatoire** (anti-fraude) avant paiement
- Gestion des chèques : traitement des chèques reçus et émis

## Ventes
- Remises globales sur toute la commande
- PDF Quote Builder : pages entête/pied personnalisées par devis
- Documents produits auto-partagés à l'envoi du devis
- Paiements partiels avec confirmation automatique
- Restrictions programmes fidélité par liste de prix
- Templates de devis incluent les tickets d'événements

## CRM
- Dates de réunions visibles sur les cartes de leads
- Propagation des tags leads vers rapports d'activités

## Stock
- **Rapport d'ancienneté du stock** : monitoring des stocks dormants
- Coût FIFO : calcul prix moyen pour quantités restantes
- Réservations flexibles : édition des quantités et quants spécifiques
- Stratégie "Least Packages" : évite de fragmenter sur plusieurs colis
- Replenishment : filtres par fournisseur, sélection de listes de produits
- **Modèle renommé : `stock.location.route` → `stock.route`** (breaking change v17)

## Fabrication
- MAJ nomenclature : appliquer changements aux OF en cours
- Propagation des composants : demandes transmises aux prélèvements de pré-production
- Rapport de synthèse OF : vue unique sur tous les aspects
- Filtre composants en retard

## Ressources Humaines
- Lieux de télétravail par jour de semaine
- Vue organigramme employés et départements
- Génération CV employé en PDF
- Rapport de suivi des certifications
- Heures supplémentaires avec génération automatique d'entrées de travail
- Pauses configurables sur les horaires

## Projets
- Statuts de tâches supplémentaires : Terminé, Annulé, En cours, Modifications demandées, Approuvé
- Génération de projets depuis les commandes de vente
- Tâches récurrentes : auto-génération à la complétion
- Raccourcis tâches : tags, assignés, heures via notation textuelle
- Acomptes inclus dans les calculs de rentabilité

## eCommerce
- Redesign du checkout
- Attributs multi-checkbox pour les variantes produits
- Attributs image (images au lieu de pastilles couleur)
- Codes promo automatiquement affichés au checkout
- Méthodes d'expédition sans besoin du module stock

## Site Web
- Templates de pages à la création
- Polices dynamiques responsive
- Support format d'image WebP
- Intégration ChatGPT pour génération de texte IA
- Bloc Instagram feed
- Couleurs personnalisées de menus

## Technique / ORM — MIGRATIONS MAJEURES (version la plus breaking de la série 15–19)

| Avant (≤16) | Après (17+) |
|---|---|
| `attrs="{'invisible': [('state','=','draft')]}"` | `invisible="state == 'draft'"` |
| `states="draft"` | `invisible="state != 'draft'"` |
| Override `name_get()` → `[(id, name)]` | Override `_compute_display_name()` → `record.display_name` |
| `(0,0,{...})`, `(1,id,{...})`, etc. | `Command.create({})`, `Command.update(id,{})`, etc. |
| `read_group()` retourne liste de dicts | `_read_group()` retourne liste de tuples avec objets |
| `invalidate_cache()`, `flush()` | `invalidate_model()`, `invalidate_recordset()`, `flush_model()`, `flush_recordset()` |
| `<tree>` | **`<list>`** |
| `kanban-card` avec divs manuels | `<card>` avec `<header>`, `<main>`, `<footer>` |
| `t-raw` | `t-out` (avec `markupsafe.Markup`) |
| `t-esc` | `t-out` (`t-esc` dépréciée) |
| `type="json"` sur contrôleur | `type="jsonrpc"` |
| Champ `license` optionnel | **`license` obligatoire** dans manifest (manquant = erreur) |
| `post_init_hook(cr, registry)` | `post_init_hook(env)` |
| `SavepointCase` | `TransactionCase` |
| `_render_qweb_pdf(res_ids)` | `_render(res_ids)` |
| Boilerplate chatter 3 champs | `<chatter/>` balise courte |
| SCSS `@import` | `@use` / `@forward` (migration Dart Sass) |
| Concaténation SQL string | Objet `SQL` pour composition sans injection |

## Points de vigilance migration v16 → v17
- `attrs=` syntaxe **complètement supprimée** : réécriture de toutes les vues custom obligatoire — aucune exception, pas de compatibilité arrière
- `read_group()` retourne une structure de données entièrement différente : adapter tout code qui itère sur le résultat (`group['field']` → `.field` sur les objets retournés)
- `name_get()` → `_compute_display_name()` : refactoring nécessaire si le modèle surcharge `name_get`
- `(0,0,{})` → `Command.*` : réécriture des manipulations O2M/M2M (utiliser `Command.create`, `Command.update`, `Command.delete`, `Command.link`, `Command.unlink`, `Command.set`)
- `<tree>` → `<list>` dans toutes les vues liste (les deux sont acceptés un temps mais `<tree>` sera supprimé)
- SCSS `@import` → `@use` : migration assets (Dart Sass — l'ancienne syntaxe génère des warnings dès v17)
- **`stock.location.route` → `stock.route`** : corriger tous les domaines, vues, actions serveur et code Python
- `license` obligatoire dans `__manifest__.py` : ajouter `'license': 'LGPL-3'` (ou OPL-1) sinon erreur au chargement

## Pour le consultant
- **Version la plus breaking de la série 15–19** : prévoir un budget de migration significatif pour les modules custom. Un audit de code avant upgrade est indispensable.
- **OWL** : le framework JS v17 apporte de gros gains de performance frontend (rendu plus rapide, moins de re-renders) — argument pour les clients qui se plaignent de lenteurs interface.
- **Frontdesk** : utile pour les sièges sociaux, usines, hôtels — suivi des visiteurs avec envoi de notifications à l'hôte et impression de badges. Sans développement, 100% standard.
- **Peppol** : intégration e-invoicing sur réseau Peppol (Belgique, Pays-Bas, Suède, Italie, France en cours). Pour activer : Comptabilité → Configuration → Paramètres → Peppol ; nécessite un identifiant GLN ou EAS.
- **Check-list migration v16→v17 (commandes utiles)** :
  - Rechercher tous les `attrs=` dans les vues XML : `grep -r 'attrs=' --include="*.xml" ./`
  - Rechercher tous les `name_get` : `grep -rn 'def name_get' --include="*.py" ./`
  - Rechercher les `<tree` dans les vues : `grep -r '<tree' --include="*.xml" ./`
  - Rechercher les `stock.location.route` : `grep -r 'stock.location.route' --include="*.py" --include="*.xml" ./`
""",

"16.0": """\
# Odoo 16.0

**Date de sortie :** 12 Octobre 2022 (Odoo Experience 2022, Bruxelles)

## Prérequis techniques
- **Python :** 3.10 minimum
- **PostgreSQL :** 12.0 minimum
- **Performance :** backend 3,7× plus rapide qu'en v15 ; eCommerce/web 2,7× plus rapide

## Nouveaux modules
- **Knowledge** — wiki interne avec articles imbriqués, vues embarquées, édition collaborative (app majeure)
- **Live Chat Chatbot** — scripting de chatbot natif dans le Live Chat (arbre de décision, choix multiples)
- **GDPR / Data Cleaning** — recherche de données personnelles, archivage/suppression de fiches, règles de nettoyage
- **Sendcloud Connector** — agrégateur d'expédition pour l'Europe occidentale
- Bibliothèque Spreadsheet open-sourcée sous LGPL

## Suppressions
- Modules **Google Drive** et **Google Spreadsheet** supprimés entièrement

## Comptabilité
- **Nouveau widget distribution analytique** avec édition en masse et modèles de distribution
- Rapprochement bancaire redessiné
- Gestion des actifs : annulation, actifs négatifs, amortissements affinés
- **Escomptes de caisse redessinés** : définitions séparées supportant différentes législations fiscales
- **Limites de crédit** : configuration par société et par partenaire
- Conditions de paiement : nouvel écran avec logique de calcul d'échéance
- OCR : validation en arrière-plan, meilleur mappage des champs
- Comptabilité Storno (débits/crédits négatifs pour les contrepassations)
- SEPA étendu aux caractères européens non-Latin

## Ventes & CRM
- **Framework fidélité/coupons multi-canal** : unifié POS, Ventes, eCommerce
  - Anciens modèles `sale.coupon.program` → **nouveaux `loyalty.program`, `loyalty.reward`, `loyalty.rule`** (breaking change majeur)
- Connecteur Amazon : onboarding simplifié, multi-marketplace
- Statut livraison visible sur les commandes (livré/partiellement livré/non livré)
- Avertissement liste de prix partenaire sur commandes ouvertes
- Détection de leads similaires par numéro de téléphone

## Stock
- Transferts par lot : automatisation par contact, transporteur ou destination
- Code-barres GS1-128 pour lots/séries avec données d'expiration
- Réapprovisionnement : automatisation par emplacement ; visibilité niveau entrepôt
- Interface barcode : optimisation mobile ; filtrage par colis
- Transferts : vue kanban, chatter intégré, édition quantités

## Fabrication
- **Tablette opérations de travail entièrement redessinée** (MES)
- Login employé par poste de charge
- Production continue : consommation auto des produits tracés lot/série
- Valorisation des kits : partage du coût entre composants de la nomenclature
- Vue d'ensemble OF/nomenclature avec délais et dates de disponibilité
- Scission/fusion des ordres de fabrication
- Portail sous-traitance : enregistrement production pour sous-traitants

## Ressources Humaines
- **Numérisation CV** pour le recrutement (extraction nom/email/téléphone)
- Détection de doublons de candidats
- Congés : transfert de plan d'acquisition ; annulation auto jours fériés ; jours de stress par département
- Évaluations : date par défaut depuis la date de contrat
- Dashboard paie ; localisation Kenya/Luxembourg

## Projets
- Gantt : barres de progression d'allocation ressources ; création de dépendances
- Jalons : lien avec les tâches ; marquage auto à la complétion
- Tâches récurrentes avec calcul automatique de date planifiée
- Planification intelligente : résolution de conflits en lot
- Facturation basée sur les jalons sur les projets de services

## eCommerce / Site Web
- Rappels paniers abandonnés
- Notifications de retour en stock
- Autocomplétion adresses Google Places
- Intégration fidélité/coupon multi-canal
- Édition mobile complète dans le constructeur de site
- Gestion du consentement cookies
- Intégration Plausible.io pour analytics

## Technique / ORM
- **Traductions** : champs traduits stockés en **JSONB dans PostgreSQL** (changement de schéma majeur)
- `search_count()` respecte désormais l'argument `limit`
- Stack HTTP refactorisée pour meilleure extensibilité
- Etherpads natifs remplacés par éditeur HTML collaboratif
- Dashboards standards convertis en rapports Spreadsheet (changement architectural)

## Points de vigilance migration v15 → v16
- **Loyalty/promotion** : tout code custom sur `sale.coupon.program` doit être réécrit vers `loyalty.program`, `loyalty.reward`, `loyalty.rule` ; les données sont migrées automatiquement mais les customisations ne le sont pas
- **Traductions stockées en JSONB** : les requêtes SQL directes sur `ir_translation` ou les tables de traductions sont cassées — utiliser l'ORM (`with_context(lang=...)`)
- Suppression Google Drive/Spreadsheet : prévoir alternative (Knowledge, Nextcloud, SharePoint) si utilisé
- **Actifs immobilisés** : modèle `account.asset` a changé — vérifier les customisations

## Pour le consultant
- **Performance** : backend 3,7× plus rapide qu'en v15 — argument fort pour les clients sur v15 qui se plaignent de lenteurs.
- **Knowledge** : app wiki interne avec vues embarquées (listes, kanban depuis d'autres modèles dans un article), édition collaborative temps-réel. Concurrent direct de Confluence/Notion dans l'écosystème Odoo. Modèle : `knowledge.article`.
- **Loyalty framework unifié** : avant v16, les coupons POS et les promotions ventes étaient des systèmes séparés. En v16, tout passe par `loyalty.program` avec `program_type` (coupons, loyalty, gift_card, promotion, discount_card, buy_x_get_y). C'est un breaking change majeur pour les clients qui avaient des customisations sur les promotions.
- **Mapping modèles Loyalty** :
  - `sale.coupon.program` → `loyalty.program`
  - `sale.coupon` → `loyalty.card`
  - `sale.coupon.reward` → `loyalty.reward`
  - `sale.coupon.rule` → `loyalty.rule`
""",

"15.0": """\
# Odoo 15.0

**Date de sortie :** 6–7 Octobre 2021 (Odoo Experience 2021)

## Prérequis techniques
- **Python :** 3.8 minimum (3.8–3.10 supportés)
- **PostgreSQL :** 12.0 ou supérieur
- **Framework JS :** OWL (Odoo Web Library) — première version de production complète

## Nouveaux modules
- **Approvals** — gestionnaire de workflow d'approbation dédié
- **Discuss** — appels vidéo/voix (extension majeure des capacités)

## Comptabilité
- Formulaire de compte avec suivi de l'historique des modifications
- Rapports d'ancienneté améliorés avec colonnes par devise
- Outil de rapprochement reconstruit : rapprochement partiel par défaut
- Génération d'écritures de régularisation depuis les commandes de vente/achat
- Mécanisme de tolérance de paiement pour les sous-paiements
- Support TVA pour les sociétés étrangères
- Connecteurs Gmail et Outlook pour la journalisation email

## Ventes & CRM
- **Lead Scoring Prédictif** remplace le scoring manuel
- Règles d'assignation de leads avec opt-out possible
- Détection de doublons de leads via boutons de stat
- Prévision des ventes avec glisser-déposer entre les mois
- Recherche de contact par numéro de téléphone

## Stock
- Refonte complète de l'interface des ajustements d'inventaire
- Inventaire cyclique par emplacement avec résolution de conflits
- Stratégie de déstockage "Closest Location"
- Réservation de stock : automatique, manuelle ou planifiée
- **Catégories de stockage** : suivi poids, nombre produits, capacité colis (pour règles putaway)
- Emballages liés aux types de colis pour l'automatisation putaway
- Infos fournisseur visibles dans la vue de réapprovisionnement

## Fabrication
- Comptabilité analytique sur les ordres de fabrication
- Copie d'opérations de nomenclature ; sous-produits spécifiques aux variantes
- Prévision des composants pour les OF en brouillon
- Production en masse de numéros de série avec confirmation en lot
- Nouveau statut ordre de travail pour vérification disponibilité matières
- MPS : options d'historique de la demande
- Dashboard d'analyse de production pour le suivi des coûts

## Ressources Humaines
- Compétences intégrées dans les évaluations
- Gestion des questionnaires d'évaluation avec suivi des réponses
- Assistant temps partiel pour changements d'horaire
- Création de fiches de paie en lot optimisée
- Gestion des commissions (structure de base)
- Standardisation des saisies sur salaires

## Projets
- Assignation de plusieurs utilisateurs par tâche
- Contrôles de visibilité des tâches privées
- Gantt avec suivi des jalons et dépendances inter-tâches
- Replanification automatique des tâches dépendantes
- Graphique burndown
- Analyse de rentabilité vs budget/coûts/revenus

## eCommerce / Site Web
- Nouveau design page produit/boutique avec affichage des remises
- Section "Produits récemment consultés"
- Achat de cartes cadeaux dans la boutique
- Notification de disponibilité pour produits en rupture
- Animations et effets texte/image dans le constructeur web
- Intégration Google Analytics GA4

## Technique / ORM
- Attribut `_sequence` supprimé de `Model` (gestion native PostgreSQL)
- `column_format` et `deprecated` supprimés de `Field`
- Attribut `limit` supprimé des `One2many` et `Many2many`
- `browse()` n'accepte plus de valeurs string pour les `ids`
- `filtered_domain()` préserve désormais l'ordre du recordset
- `fields_get_keys()` et `get_xml_id()` dépréciés
- `search()`, `search_count()`, `_search()` : paramètre `args` renommé en `domain`
- Nouveau flush/cache API sur `Model` et `Environment`
- Possibilité de spécifier le type d'index PostgreSQL sur les champs (`index='btree'`, `index='hash'`)

## Pour le consultant
- **OWL en production** : v15 est la première version stable avec OWL. Certains modules tiers v14 ne sont pas encore portés — vérifier la compatibilité de chaque module tiers avant de conseiller une migration.
- **Predictive Lead Scoring** : remplace le scoring manuel. Basé sur les données historiques de conversion (needs > 30 jours de données pour être utile). Configurable dans CRM → Configuration → Paramètres → Scoring prédictif.
- **Approvals** : module indépendant pour les workflows d'approbation (achats hors seuil, dépenses, heures supplémentaires, etc.). Évite les développements custom pour les circuits de validation simples. Modèle : `approval.request`.
- **Discuss (vidéo/voix)** : intégration de WebRTC pour les appels internes. Fonctionne sans plugin externe mais nécessite un serveur TURN/STUN pour les appels cross-NAT en production.
- **v15 est encore largement déployée** (LTS de facto pour les PME) : attendre d'autres versions est risqué techniquement mais la migration v15→v16 est moins breaking que v16→v17.
""",
}


# ── English default context ───────────────────────────────────────

_SKILLS_MD_EN = """\
# Skills and context — Odoo consultant

## Assistant role
You are the co-pilot of an experienced Odoo consultant. You analyze client production instances,
read Odoo and custom source code, diagnose issues, and propose concrete actions.

## How the AI should use this file
- This file is an operational memo, not the ultimate source of truth.
- Source priority: live Odoo data > client source code > local Odoo source code > project context > this file.
- Models and domains can vary by version, edition, installed modules, and customizations.
- Before asserting a model, field, amount, or volume, verify it with the available tools.
- If a point remains uncertain, state it explicitly and propose the shortest verification.

## Consultant rules
1. Cross-check live data and source code when available.
2. Cite the exact model, field, domain, file, or method used to support the answer.
3. Proactively flag anomalies: duplicates, inconsistent states, corrupted or stale data.
4. Distinguish standard Odoo from custom modules or Studio customizations.
5. Separate verified facts, assumptions, and recommendations when ambiguity matters.
6. Adapt depth to the active perspective: AM/BA = business process; Archi/Dev = models, fields, code.

## Default response contract
- Start with a direct 2-5 line answer.
- Use Markdown tables when they clarify comparisons, anomalies, or action plans.
- End with at most 3 next actions, sorted by impact.
- Do not invent menus, fields, or settings: verify or mark them as "to confirm".

---

## Accounting & Finance
| Need | Model | Key domain |
|---|---|---|
| Customer invoices | `account.move` | `[["move_type","in",["out_invoice","out_refund"]]]` |
| Vendor bills | `account.move` | `[["move_type","in",["in_invoice","in_refund"]]]` |
| Overdue invoices | `account.move` | `[["payment_state","not in",["paid","in_payment"]],["invoice_date_due","<","<today>"],["state","=","posted"]]` |
| Payments | `account.payment` | `[["state","=","posted"]]` |
| Journal items | `account.move.line` | `[["move_id.state","=","posted"]]` |
| Taxes | `account.tax` | `[["active","=",true]]` |
| Analytic lines | `account.analytic.line` | — |

Key `account.move` fields: `state`, `move_type`, `payment_state`, `invoice_date_due`, `amount_residual`, `invoice_origin`.

## Sales & CRM
| Need | Model | Key domain |
|---|---|---|
| Sales orders | `sale.order` | `[["state","in",["sale","done"]]]` |
| Quotations | `sale.order` | `[["state","in",["draft","sent"]]]` |
| Sales order lines | `sale.order.line` | — |
| Opportunities | `crm.lead` | `[["type","=","opportunity"]]` |
| Activities | `mail.activity` | `[["res_model","=","crm.lead"]]` |
| Pricelists | `product.pricelist` | — |

Key fields: `sale.order.state`, `invoice_status`, `delivery_status`, `commitment_date`; `crm.lead.stage_id`, `probability`, `expected_revenue`, `user_id`.

## Purchasing
| Need | Model | Key domain |
|---|---|---|
| Purchase orders | `purchase.order` | `[["state","in",["purchase","done"]]]` |
| RFQs | `purchase.order` | `[["state","in",["draft","sent","to approve"]]]` |
| Purchase lines | `purchase.order.line` | — |
| Vendor pricelists | `product.supplierinfo` | — |

## Inventory & Logistics
| Need | Model | Key domain |
|---|---|---|
| Stock moves | `stock.move` | `[["state","=","done"]]` |
| Move lines | `stock.move.line` | `[["state","=","done"]]` |
| Transfers | `stock.picking` | `[["state","in",["confirmed","assigned","waiting"]]]` |
| On-hand stock | `stock.quant` | `[["location_id.usage","=","internal"]]` |
| Lots / serials | `stock.lot` | — |
| Reordering rules | `stock.warehouse.orderpoint` | — |

Common diagnostics: negative quants, blocked pickings, orphan moves, lots without traceability.

## HR & Payroll
| Need | Model | Key domain |
|---|---|---|
| Employees | `hr.employee` | `[["active","=",true]]` |
| Contracts | `hr.contract` | `[["state","=","open"]]` |
| Leaves | `hr.leave` | `[["state","=","validate"]]` |
| Attendances | `hr.attendance` | `[["check_out","=",false]]` |
| Payslips | `hr.payslip` | `[["state","=","done"]]` |

## Projects & Timesheets
| Need | Model | Key domain |
|---|---|---|
| Projects | `project.project` | `[["active","=",true]]` |
| Tasks | `project.task` | `[["stage_id.fold","=",false]]` |
| Timesheets | `account.analytic.line` | `[["project_id","!=",false],["employee_id","!=",false]]` |

## Manufacturing (MRP)
| Need | Model | Key domain |
|---|---|---|
| Manufacturing orders | `mrp.production` | `[["state","in",["confirmed","progress","to_close"]]]` |
| Bills of materials | `mrp.bom` | `[["active","=",true]]` |
| Work orders | `mrp.workorder` | `[["state","in",["ready","progress"]]]` |
| Work centers | `mrp.workcenter` | — |

## eCommerce & Website
| Need | Model | Key domain |
|---|---|---|
| Published products | `product.template` | `[["is_published","=",true]]` |
| Website orders | `sale.order` | `[["website_id","!=",false]]` |
| Abandoned carts | `sale.order` | `[["state","=","draft"],["website_id","!=",false]]` |
| Pages | `website.page` | — |

## Point of Sale (POS)
| Need | Model | Key domain |
|---|---|---|
| POS sessions | `pos.session` | `[["state","=","opened"]]` |
| POS orders | `pos.order` | `[["state","in",["paid","done","invoiced"]]]` |
| POS configs | `pos.config` | `[["active","=",true]]` |

## Essential cross-functional models
| Model | Usage |
|---|---|
| `res.partner` | Customers, vendors, contacts |
| `res.users` | Internal and portal users |
| `res.company` | Companies / multi-company |
| `product.template` | Commercial product record |
| `product.product` | Stock variant |
| `ir.attachment` | Attachments |
| `ir.model.access` | Model-level access rights |
| `ir.rule` | Record rules |
| `res.groups` | Security groups |

## Advanced diagnostic patterns
```
# Customer invoices overdue by more than 90 days
account.move | [["payment_state","not in",["paid","in_payment"]],["invoice_date_due","<","<date_90d>"],["state","=","posted"],["move_type","=","out_invoice"]]

# Delivered but uninvoiced sales orders
sale.order | [["invoice_status","=","to invoice"],["state","=","sale"]]

# Open attendances without checkout
hr.attendance | [["check_out","=",false]]

# Blocked transfers
stock.picking | [["state","in",["confirmed","assigned"]],["scheduled_date","<","<date_7d>"]]
```

## Security & Access Rights
Important groups: `base.group_user`, `base.group_portal`, `account.group_account_user`,
`account.group_account_manager`, `sale.group_sale_manager`, `stock.group_stock_manager`,
`hr.group_hr_user`, `project.group_project_user`.

## Customizations: how to spot them
- `x_*` fields or models, especially `x_studio_*`.
- Installed modules whose author is not Odoo.
- Views inheriting standard views from custom modules.
- Server actions, crons, and record rules created outside standard modules.

## Performance & Optimization
- Avoid querying `ir.attachment` without `res_model`.
- Avoid `mail.message` without `res_model` or `res_id`.
- Filter large accounting reports on `move_id.state = 'posted'`.
- For exhaustive code volume, use `count_source_lines`, not search result counts.

## Status workflows — quick reference
| Document | States |
|---|---|
| Quotation to order | draft -> sent -> sale -> done / cancel |
| Invoice | draft -> posted -> cancel |
| Transfer | draft -> waiting -> confirmed -> assigned -> done / cancel |
| Manufacturing order | draft -> confirmed -> progress -> to_close -> done / cancel |

## Client analysis best practices
- Verify the exact Odoo version from `ir.module.module` / `base`.
- List third-party modules before concluding a behavior is standard.
- Check archived records when counts or screens do not match.
- In multi-company setups, always verify the active company and record rules.
"""

_MEETING_MINUTE_MD_EN = """\
# Meeting minutes template

Use this template when asked to generate meeting minutes. Adapt sections to the real conversation and remove empty sections.

## Generation rules
- Do not invent participants, decisions, deadlines, or owners.
- If information is missing, write `To confirm`.
- Convert long discussions into decisions, risks, open questions, and concrete actions.

---

# Meeting minutes — [Main topic]

**Date:** [meeting date]
**Duration:** [estimated duration]
**Location / Channel:** [onsite / Teams / Zoom / etc.]

**Participants:**
- [First Last] — [Role]

**Written by:** [Consultant name]

## 1. Context and objective
[Short description of the context and expected outcome]

## 2. Topics discussed
### 2.1 [Topic]
[Summary of the discussion]

## 3. Decisions
| # | Decision | Decision maker |
|---|---|---|
| 1 | [Decision] | [Name] |

## 4. Follow-up actions
| # | Action | Owner | Due date | Status |
|---|---|---|---|---|
| 1 | [Action] | [Name] | [Date] | To do |

## 5. Open questions
- [Question or blocker]

## 6. Next steps
- **Next meeting:** [date or "to be defined"]
- **Planned agenda:** [topics]
"""

_MIGRATION_MD_EN = """\
# Odoo migration methodology

This document is a shared reference for migration questions. Adapt vocabulary to the active perspective:
functional AM/BA for business process, UX, training, and change management; technical Archi/Dev for ORM, views,
hooks, scripts, and compatibility.

## Migration response contract
- Start with the main risk or opportunity.
- Distinguish standard Odoo, client custom code, data to migrate, and configuration to rebuild.
- In AM/BA mode, translate changes into user impact, training, and business decisions.
- In Archi/Dev mode, cite models, fields, files, hooks, scripts, or commands.
- End with at most 3 next actions.

## 1. Scoping questions
### Business
- Which processes are critical: sales, purchase, stock, accounting, HR, project, MRP?
- Which standard modules are installed and which are heavily customized?
- Which external integrations exist: payments, EDI, banking, BI, e-commerce, IoT?
- Are there calendar constraints: closing, payroll, peak sales period, financial year end?

### Technical
- Exact source and target versions.
- Custom modules: internal, partner, OCA, paid third-party.
- Data volume and migration runtime constraints.
- Hosting: on-premise, Odoo.sh, Odoo Online.

## 2. Migration phases
| Phase | Main deliverable | Contributors |
|---|---|---|
| Audit | Modules, customizations, integrations, volumes | AM + Dev |
| Scope | Target scenarios, estimate, planning | AM + PM |
| Technical migration | Database and custom modules on test env | Dev / DBA |
| Functional testing | Acceptance by business process | AM + key users |
| Change management | Training, FAQ, communication | AM |
| Cutover | Go/no-go, freeze, backup, production switch | All |
| Hypercare | Reinforced support after go-live | AM + Dev |

## 3. Functional analysis
Produce: new standard features, deprecated/replaced features, obsolete custom modules, UX changes, process impact,
role impact, training needs.

Recommended table:
| Business domain | Before | Target version | User impact | AM action | Effort |
|---|---|---|---|---|---|

## 4. Technical analysis
Produce: custom module compatibility, framework breaking changes, data migration strategy, infrastructure plan,
automated tests.

Recommended table:
| Element | Source | Target | Required action | Risk |
|---|---|---|---|---|

Common breaking changes:
- v16 -> v17: XML `attrs` removed, `<tree>` becomes `<list>`, `name_get()` replaced by display name logic.
- v17 -> v18: Python 3.12 implications, access API changes, stronger CSP.
- v18 -> v19: PostgreSQL 13 minimum, Membership replaced by Partnership.

## 5. Cutover strategy
- Big bang: simpler coordination, concentrated risk.
- Progressive: lower risk by site/company/module, but coexistence complexity.

## 6. Frequent risks
| Risk | Impact | Mitigation |
|---|---|---|
| Incompatible custom module | High | Early code audit |
| Corrupted or duplicate data | High | Cleanup before migration |
| Broken integration | High | End-to-end tests |
| User rejection | Medium | Training and hypercare |
| Reporting rebuild | Medium | Report inventory |

## 7. Tools to use
- `search_odoo_source` / `read_odoo_file`: source version.
- `search_target_source` / `read_target_file`: target version.
- `search_project_source` / `read_project_file`: client custom modules.
- `count_source_lines`: exhaustive code volume.
- `query_odoo`, `count_odoo`, `get_odoo_fields`: live client data.
"""

_STUDIO_MD_EN = """\
# Studio inspection guide

## Role of `inspect_studio`
When the user asks what was done with Studio, which custom fields/models/views exist, or how Studio affects migration,
always use `inspect_studio` before answering. Do not guess customizations without querying the instance.

## Expected analysis quality
- Separate facts returned by `inspect_studio` from interpretations.
- Link each customization to its business impact and technical risk.
- Do not conclude that a customization is useless without checking the business process.
- In migration, classify items as: keep, replace with standard, rebuild, remove.

## Naming conventions
| Element | Technical convention | Examples |
|---|---|---|
| Custom models | `x_<name>` with `state='manual'` | `x_construction_project` |
| Custom fields | `x_<name>` or `x_studio_<name>` | `x_warranty`, `x_studio_ref` |
| Studio views | `studio_customization.<hash>` | overlay on a standard view |
| Server actions | bound to a model/action | button in a form view |
| Automations | `base.automation` triggers | write/create notifications |

## Recommended inspection flow
1. Full inventory: `inspect_studio(sections=['all'])`.
2. Data model focus: `models`, `fields`.
3. Interface focus: `views`, `menus`.
4. Logic focus: `server_actions`, `cron`, `automations`.
5. Filter by app when the result is large.

## Recommended output
| Area | Count | Business impact | Technical risk | Recommended action |
|---|---:|---|---|---|

## Migration warnings
- Studio views often break between major versions and must be retested.
- Embedded Python in server actions must be checked against the target ORM.
- Custom security rules can hide records after migration if groups changed.
- Non-stored compute fields can become performance bottlenecks.
"""

_VERSION_NOTES_EN = {
    "19.0": """\
# Odoo 19.0

## Technical prerequisites
- PostgreSQL 13 minimum.
- Python 3.11 recommended.

## Functional highlights
- Partnership replaces Membership.
- New AI framework and industry packs.
- Accounting: enhanced fiscal reports, Peppol/tax improvements, WhatsApp follow-ups.
- Sales/CRM: AI lead probability, business card scanning, portal partial payments.
- Inventory: multiple routes per sales line, nested packages, WhatsApp shipping notifications.
- MRP: Gantt for manufacturing orders, lot size improvements, labor cost impact.

## Migration watchpoints
- PostgreSQL 13 is blocking.
- Port Membership customizations to Partnership.
- Validate Python compatibility for custom modules.
""",
    "18.0": """\
# Odoo 18.0

## Technical prerequisites
- Python 3.10 minimum; Python 3.12 recommended.
- PostgreSQL 12 minimum.

## Functional highlights
- Sales Commissions and Dispatch Management.
- Accounting: abnormal invoice alerts, redesigned analytic budgets, loans, Peppol.
- Sales: combo products, dynamic quotation templates, EDI order import.
- Inventory: lot/serial valuation, flexible routes, improved putaway.
- Website/eCommerce: SEO and product page improvements.

## Migration watchpoints
- Check removed payment providers and connector replacements.
- Audit inline scripts / CSP-sensitive frontend customizations.
""",
    "17.0": """\
# Odoo 17.0

## Technical highlights
- Major view syntax changes: `attrs` and `states` moved to direct expressions.
- `<tree>` gradually replaced by `<list>`.
- `name_get()` pattern moves toward computed display names.
- Route model rename: `stock.location.route` -> `stock.route`.

## Functional highlights
- UX refresh across apps.
- Accounting, sales, inventory, and website improvements.

## Migration watchpoints
- This is one of the most breaking upgrades for custom XML views.
- Audit every inherited view and custom display name override.
""",
    "16.0": """\
# Odoo 16.0

## Highlights
- Stronger analytic accounting model with analytic plans.
- Inventory, MRP, website, and project improvements.
- More mature OWL frontend stack.

## Migration watchpoints
- Review analytic customizations and accounting reports.
- Validate JavaScript assets and frontend custom modules.
""",
    "15.0": """\
# Odoo 15.0

## Highlights
- Production-ready OWL web client generation.
- Inventory adjustment redesign and replenishment improvements.
- Accounting reconciliation improvements.
- Project, HR, website, and eCommerce enhancements.

## Migration watchpoints
- Review removed/deprecated ORM fields and search argument naming.
- Validate custom web assets and reporting.
""",
}
