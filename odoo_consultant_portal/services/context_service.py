"""Manage editable markdown context files used to enrich AI prompts."""

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
        result.append({"name": f.name, "size": stat.st_size, "modified": stat.st_mtime})
    return result


def read_file(name: str) -> str:
    path = _safe(name)
    if not path.exists():
        content = _default_content(name)
        if content:
            path.write_text(content, encoding="utf-8")
            return content
        raise FileNotFoundError(f"{name} introuvable")
    return path.read_text(encoding="utf-8")


def write_file(name: str, content: str) -> None:
    _safe(name).write_text(content, encoding="utf-8")


def delete_file(name: str) -> None:
    path = _safe(name)
    if path.exists():
        path.unlink()


def load_context_for_prompt(odoo_version: Optional[str] = None) -> str:
    """Return combined context string to inject into AI system prompt."""
    sections = []
    try:
        sections.append(("Compétences consultant", read_file("skills.md")))
    except FileNotFoundError:
        pass
    if odoo_version:
        try:
            sections.append((f"Notes de version Odoo {odoo_version}", read_file(f"odoo-{odoo_version}.md")))
        except FileNotFoundError:
            pass
    if not sections:
        return ""
    return "\n\n---\n\n".join(f"## {title}\n\n{content.strip()}" for title, content in sections)


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
Tu es le co-pilote d'un consultant Odoo expérimenté. Tu analyses des instances client en production,
tu lis le code source Odoo, tu diagnostiques des anomalies et tu proposes des solutions concrètes.
Sois toujours factuel : interroge les vraies données avant de conclure. Ne devine jamais un chiffre.

## Règles d'or du consultant
1. Toujours croiser données live + code source quand disponible
2. Citer le modèle, le champ exact et le domain utilisé dans chaque réponse
3. Signaler proactivement les anomalies trouvées (doublons, incohérences, données corrompues)
4. Distinguer ce qui est standard Odoo de ce qui est une customisation (module custom)
5. Proposer des actions concrètes : domain Odoo, module concerné, vue à vérifier, champ exact

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
| Factures en retard | `account.move` | `[["payment_state","not in",["paid","in_payment"]],["invoice_date_due","<","2025-01-01"],["state","=","posted"]]` |
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
- **Blocker : PostgreSQL doit être ≥ 13** avant migration
- Module Membership → Partnership : toute personnalisation doit être portée
- Vérifier compatibilité Python 3.11 pour les modules custom
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
- `name_get()` officiellement dépréciée : migrer vers `display_name`
- Nouvelles méthodes contrôle d'accès peuvent changer le comportement des custom modules
- URLs lisibles : vérifier les redirections et liens hardcodés dans les vues custom
- Python 3.12 : corriger `datetime.utcnow()` et supprimer références à `distutils`
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
- `attrs=` syntaxe **complètement supprimée** : réécriture de toutes les vues custom obligatoire
- `read_group()` retourne une structure de données entièrement différente
- `name_get()` → `_compute_display_name()` : refactoring nécessaire
- `(0,0,{})` → `Command.*` : réécriture des manipulations O2M/M2M
- `<tree>` → `<list>` dans toutes les vues liste
- SCSS `@import` → `@use` : migration assets
- **`stock.location.route` → `stock.route`** : corriger tous les domaines et références
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
- **Loyalty/promotion** : tout code custom sur `sale.coupon.program` doit être réécrit vers `loyalty.program`, `loyalty.reward`, `loyalty.rule`
- **Traductions stockées en JSONB** : les requêtes SQL directes sur les tables de traductions sont cassées
- Suppression Google Drive/Spreadsheet : prévoir alternative si utilisé
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
- Possibilité de spécifier le type d'index PostgreSQL sur les champs
""",
}
