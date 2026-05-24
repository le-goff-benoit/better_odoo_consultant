---
name: inspect_security
label: Inspecter la sécurité
label_en: Inspect security
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Lire ACL, record rules et groupes liés à un modèle pour diagnostiquer les droits d'accès."
description_en: "Read ACLs, record rules and groups for a model to diagnose access rights."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [droits, "droit d'accès", "droits d'accès", access, access right, access rights, acl, ir.model.access, record rule, security rule, ir.rule, sécurité, securite, règle de sécurité, regle de securite, permission, groupe, invisible, accès refusé, ne voit pas]
version: "1.0.0"
tags: [odoo, security, acl]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: odoo_consultant_portal/skills/inspect-security/scripts/handler.py
references_auto_load:
  - file: acl_primer.md
    triggers: [acl, ir.model.access, record rule, ir.rule, droits d'accès, droits d acces, security rule, security rules, access right, access rights, sudo, groupe technique, group_id, implied_ids, global=True, accès refusé]
---

## Principes communs
- Skill en lecture seule : il inspecte la sécurité déclarée sur un modèle.
- Distingue toujours ACL, record rules et groupes.

## inspect_security
Utilise `inspect_security` pour diagnostiquer droits d'accès, visibilité partielle et règles multi-société.

## Quand l'utiliser
- L'utilisateur ne voit pas des enregistrements, menus, boutons ou actions.
- Une opération échoue par accès refusé.
- Tu dois expliquer pourquoi un comptage peut être partiel.
- L'utilisateur demande s'il existe des règles de sécurité particulières dans
  des modules custom : identifie d'abord les modèles et fichiers de sécurité du
  dépôt, puis inspecte les modèles live concernés.

## Bonnes pratiques
- Inspecte le modèle exact concerné.
- Si aucun modèle exact n'est donné, combine `list_project_modules`,
  `search_project_source` et `read_project_file` pour repérer les fichiers
  `security/ir.model.access.csv`, XML avec `ir.rule`, groupes et external ids.
- ACL = droits CRUD globaux par groupe ; record rules = filtre sur les enregistrements.
- Cite les groupes et domains de règles qui expliquent le symptôme.
- Complète avec `inspect_menus_actions` si le problème concerne la navigation.

## Déclencheurs
- Accès refusé, records manquants, menus/boutons invisibles, droits, groupes, multi-société.
- Incohérence entre deux utilisateurs.

## Séquence recommandée
1. Identifie le modèle exact.
2. Appelle `inspect_security`.
3. Si le symptôme est UI, ajoute `inspect_menus_actions` et `inspect_odoo_view`.
4. Si modules custom mentionnés, lis `security/` avec les skills projet.

## Paramètres
- `model`: modèle à analyser.
- Les sections ACL et record rules retournent leurs métadonnées (`*_meta`) avec `total_count`, `truncated`, `warning`.
- Si `truncated=true`, ne conclus pas sur l'ensemble des droits avant une lecture plus ciblée.

## Pièges
- ACL autorise CRUD globalement ; record rules filtrent les records.
- Les groupes impliqués peuvent être hérités.
- Les requêtes live de l'assistant voient seulement ce que l'utilisateur API peut voir.

## Combinaisons
- `query_odoo` / `count_odoo` pour mesurer l'effet visible.
- `search_project_source` pour règles custom.
- `inspect_menus_actions` pour navigation et actions.

## Critères de réponse
- Séparer ACL, record rules, groupes, effet concret et vérification recommandée.
