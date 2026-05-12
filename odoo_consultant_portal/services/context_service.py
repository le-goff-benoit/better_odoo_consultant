"""Manage editable markdown context files used to enrich AI prompts."""

import os
import re
from pathlib import Path
from typing import Optional

_CONTEXT_DIR = Path.home() / ".odoo-consultant" / "context"

_ALLOWED_NAME = re.compile(r'^[\w\-\.]+\.md$')


def context_dir() -> Path:
    _CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    return _CONTEXT_DIR


def _safe(name: str) -> Path:
    if not _ALLOWED_NAME.match(name):
        raise ValueError(f"Nom de fichier invalide : {name}")
    return context_dir() / name


def list_files() -> list[dict]:
    d = context_dir()
    result = []
    for f in sorted(d.glob("*.md")):
        stat = f.stat()
        result.append({
            "name":     f.name,
            "size":     stat.st_size,
            "modified": stat.st_mtime,
        })
    return result


def read_file(name: str) -> str:
    path = _safe(name)
    if not path.exists():
        # Return default content and save it
        content = _default_content(name)
        if content:
            path.write_text(content, encoding="utf-8")
            return content
        raise FileNotFoundError(f"{name} introuvable")
    return path.read_text(encoding="utf-8")


def write_file(name: str, content: str) -> None:
    path = _safe(name)
    path.write_text(content, encoding="utf-8")


def delete_file(name: str) -> None:
    path = _safe(name)
    if path.exists():
        path.unlink()


def load_context_for_prompt(odoo_version: Optional[str] = None) -> str:
    """Return combined context string to inject into AI system prompt."""
    sections = []

    # Always include skills
    try:
        sections.append(("Compétences consultant", read_file("skills.md")))
    except FileNotFoundError:
        pass

    # Include version-specific release notes
    if odoo_version:
        fname = f"odoo-{odoo_version}.md"
        try:
            sections.append((f"Notes de version Odoo {odoo_version}", read_file(fname)))
        except FileNotFoundError:
            pass

    if not sections:
        return ""

    parts = []
    for title, content in sections:
        parts.append(f"## {title}\n\n{content.strip()}")
    return "\n\n---\n\n".join(parts)


# ── Default content ───────────────────────────────────────────────

def _default_content(name: str) -> Optional[str]:
    if name == "skills.md":
        return _SKILLS_MD
    m = re.match(r'^odoo-([\d\.]+)\.md$', name)
    if m:
        return _VERSION_NOTES.get(m.group(1))
    return None


_SKILLS_MD = """\
# Compétences et contexte — Consultant Odoo

## Rôle de l'assistant
Tu aides un consultant Odoo à analyser les données d'instances client, comprendre le code source,
diagnostiquer des problèmes et préparer des recommandations. Sois précis, factuel, orienté résultats.

## Approche recommandée
- Interroger la base de données réelle avant de répondre (ne jamais inventer de chiffres)
- Croiser données live + code source quand disponible
- Signaler les incohérences ou anomalies trouvées
- Proposer des actions concrètes (domain Odoo, module concerné, champ exact)

## Domaines métier fréquents

### Comptabilité
- Factures clients : `account.move` domain `[["move_type","in",["out_invoice","out_refund"]]]`
- Factures fournisseurs : `account.move` domain `[["move_type","in",["in_invoice","in_refund"]]]`
- Paiements : `account.payment`
- Rapprochement bancaire : `account.bank.statement.line`
- Plans comptables : `account.account`

### Ventes & CRM
- Commandes : `sale.order`, lignes : `sale.order.line`
- Opportunités : `crm.lead` (lead et opportunity dans le même modèle)
- Équipes commerciales : `crm.team`
- Listes de prix : `product.pricelist`

### Achats
- Commandes achat : `purchase.order`, lignes : `purchase.order.line`
- Appels d'offres : même modèle avec `state='sent'`

### Stock & Logistique
- Mouvements : `stock.move`, opérations détail : `stock.move.line`
- Transferts : `stock.picking`
- Emplacements : `stock.location`
- Routes : `stock.route` (avant v16 : `stock.location.route`)
- Règles réappro : `stock.warehouse.orderpoint`
- Lots/numéros de série : `stock.lot`

### Ressources Humaines
- Employés : `hr.employee`
- Contrats : `hr.contract`
- Congés (demandes) : `hr.leave`, allocations : `hr.leave.allocation`
- Présences : `hr.attendance`
- Fiches de paie : `hr.payslip`

### Projets
- Projets : `project.project`
- Tâches : `project.task`
- Feuilles de temps : `account.analytic.line` (domain `[["project_id","!=",false]]`)

### Fabrication
- Ordres de fabrication : `mrp.production`
- Nomenclatures : `mrp.bom`, composants : `mrp.bom.line`
- Ordres de travail : `mrp.workorder`
- Postes de charge : `mrp.workcenter`

## Conseils de diagnostic courants
- Client avec double-paiement : chercher `account.payment` doublons sur même `partner_id` + période
- Stock négatif : `stock.quant` avec `quantity < 0`
- Factures bloquées : `account.move` avec `payment_state='not_paid'` et `invoice_date_due < today`
- Utilisateurs sans accès : `res.users` avec `active=False` ou `share=True`
"""

_VERSION_NOTES: dict = {

"19.0": """\
# Odoo 19.0

**Date de sortie :** Octobre 2025

## Nouveautés majeures

### Intelligence Artificielle
- Odoo AI intégré nativement dans tous les modules
- Génération automatique de descriptions produits, emails, rapports
- Prédiction de churn client dans le CRM
- Assistant IA dans la comptabilité pour la catégorisation automatique

### Comptabilité
- Nouveau moteur de rapports financiers entièrement reécrit
- Clôture fiscale améliorée avec checklist automatique
- Support étendu des normes IFRS 16 (leasing)
- Rapprochement bancaire IA : suggestion automatique à 95%+

### Ventes & CRM
- Pipeline CRM repensé avec vue Kanban enrichie
- Scoring de leads amélioré avec IA
- Nouveau configurateur de produits intégré
- Gestion des abonnements (subscriptions) améliorée

### Stock & Fabrication
- Planification MRP améliorée avec contraintes multiples
- Traçabilité lot/série enrichie
- Nouveau module Quality Control intégré
- Barcode app entièrement reécrite

### Ressources Humaines
- Nouveau module Learning Management System (LMS)
- Organigramme dynamique amélioré
- Gestion des compétences et formations

### Technique
- Framework OWL 3.0
- Performance : chargement 40% plus rapide
- API JSON-RPC v2 améliorée
- Support Python 3.12

## Modèles renommés / déplacés
- Aucun renommage majeur de modèles en 19.0
""",

"18.0": """\
# Odoo 18.0

**Date de sortie :** Octobre 2024

## Nouveautés majeures

### Intelligence Artificielle (Odoo AI)
- Module `mail.ai` : suggestions de réponses dans le chatter
- Résumé automatique de conversations
- Traduction instantanée dans l'interface
- Extraction automatique de données depuis pièces jointes

### Comptabilité & Finance
- Nouveau tableau de bord financier temps réel
- Amélioration du module SEPA (virements et prélèvements)
- Rapports personnalisables avec formules Excel-like
- Gestion améliorée des devises et taux de change

### Ventes
- Nouveau module `sale.subscription` unifié
- Devis interactifs avec signature électronique améliorée
- Portail client enrichi

### Stock
- Putaway rules améliorées avec stratégies multiples
- Nouvelle interface barcode entièrement refaite
- Coût de revient AVCO amélioré

### Fabrication
- Planning visuel des OF sur le Gantt
- Gestion des sous-traitants améliorée
- Qualité : nouveaux points de contrôle automatiques

### Ressources Humaines
- Module Payroll reécrit (nouveau moteur de règles)
- Appraisal (évaluation) avec objectifs OKR
- Fleet : gestion des contrats de leasing

### Technique
- OWL 2.x stable, migration progressive vers OWL 3
- Support Python 3.11/3.12
- PostgreSQL 16 supporté
- Nouveau système de translations (po → json)

## Modèles renommés / déplacés
- `sale.subscription` : refonte complète (fusion avec `sale.order` recurring)
- `hr.payslip.run` : améliorations sans renommage
""",

"17.0": """\
# Odoo 17.0

**Date de sortie :** Octobre 2023

## Nouveautés majeures

### Interface & UX
- Nouveau design système (tons plus clairs, topbar redessinée)
- Mode sombre disponible
- Raccourcis clavier étendus
- Recherche globale améliorée

### Comptabilité
- Lock dates améliorées (par utilisateur / par période)
- Rapprochement bancaire : correspondance partielle
- Nouveau widget de saisie des écritures
- Localisation fiscale améliorée (multi-pays)

### Ventes & CRM
- Nouveau configurateur de variantes produits
- Devis en ligne redessinés
- CRM : merge de leads/opportunités amélioré
- WhatsApp Business intégré (envoi de devis, factures)

### Stock
- Routes : modèle renommé `stock.location.route` → `stock.route`
- Nouvelle interface réceptions/expéditions
- Lots et numéros de série : suivi de coût amélioré
- Inventaire cyclique simplifié

### Fabrication
- MRP III : planification à capacité finie
- Ordres de travail : timer réel sur l'atelier
- BoM version control

### Technique & Développement
- OWL 2.0 obligatoire (suppression de l'ancien framework web)
- Studio : nouveaux types de vues personnalisées
- Spreadsheet : pivot multi-sources, graphiques
- Nouveau système de hooks Python

## Modèles renommés / déplacés (v17)
- `stock.location.route` → `stock.route`
- `mail.message.subtype` → supprimé (intégré dans `mail.message`)
""",

"16.0": """\
# Odoo 16.0

**Date de sortie :** Octobre 2022

## Nouveautés majeures

### Spreadsheet & Reporting
- Module Spreadsheet : tableaux croisés dynamiques natifs
- Dashboards partageables depuis Spreadsheet
- Rapports financiers dans Spreadsheet

### Site Web & eCommerce
- Nouveau constructeur de site (Website Builder v3)
- Performance eCommerce : chargement 60% plus rapide
- Nouveau checkout simplifié

### Comptabilité
- Déclarations fiscales : nouveau moteur de rapport
- Suivi analytique : multi-plans analytiques
- Lettrages automatiques améliorés

### Ventes & CRM
- Vue liste améliorée dans CRM
- Nouveau module Rental (location de matériel)

### Stock
- Méthode d'évaluation AVCO : améliorée
- Réceptions multi-étapes simplifiées
- Emballages : gestion avancée

### Technique
- OWL 2 (version beta) introduit
- Performance : lazy loading des vues
- Support Python 3.10

## Modèles importants
- Nouveau : `spreadsheet.dashboard`
- Analytique : `account.analytic.plan` (multi-plans)
""",

"15.0": """\
# Odoo 15.0

**Date de sortie :** Octobre 2021

## Nouveautés majeures

### Interface
- Nouveau client web (refonte complète)
- Navigation par fil d'Ariane améliorée
- Panneaux de recherche contextuels

### Comptabilité
- Rapports financiers : nouveau moteur (python-based)
- Chèques : gestion améliorée
- Écritures d'abonnement (recurring entries)

### Ventes
- Devis : nouveau portail client
- Ventes en ligne : catalogue amélioré

### Stock
- Opérations de réception/expédition enrichies
- Coût de revient : améliorations FIFO

### Ressources Humaines
- Congés : nouveau calendrier global
- Fiche de paie : améliorations règles salariales

### Technique
- Introduction OWL 1.x (framework JS)
- Chatter redessiné
- Support Python 3.9/3.10

## Notes de migration v14 → v15
- `res.config.settings` : certains champs déplacés
- `mail.activity.mixin` : changements d'API
""",
}
