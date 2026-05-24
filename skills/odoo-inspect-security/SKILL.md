---
name: odoo_inspect_security
aliases: [inspect_security]
label: Inspecter la sécurité
label_en: Inspect security
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Diagnostiquer les droits d'accès Odoo d'un modèle : ACL ir.model.access, record rules ir.rule, groupes, multi-société, sudo, group_id, visibilité partielle, accès refusé, « l'utilisateur ne voit pas ». Utiliser pour expliquer une erreur d'accès, auditer la sécurité ou comprendre une visibilité. Ne pas utiliser pour les droits sur un menu/action (odoo_inspect_navigation) ni pour des invisible/readonly UI (odoo_inspect_view)."
description_en: "Diagnose Odoo model access security: ACLs ir.model.access, record rules ir.rule, groups, multi-company, sudo, group_id, partial visibility, access denied, 'user can't see'. Use to explain an access error, audit security or understand a visibility rule. Do not use for menu/action access (odoo_inspect_navigation) or UI invisible/readonly logic (odoo_inspect_view)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [droits, "droit d'accès", "droits d'accès", access, access right, access rights, acl, ir.model.access, record rule, security rule, ir.rule, sécurité, securite, règle de sécurité, regle de securite, permission, groupe, invisible, accès refusé, ne voit pas]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, security, acl]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-inspect-security/scripts/handler.py
references_auto_load:
  - file: acl_primer.md
    triggers: [acl, ir.model.access, record rule, ir.rule, droits d'accès, droits d acces, security rule, security rules, access right, access rights, sudo, groupe technique, group_id, implied_ids, global=True, accès refusé]
---

## Principes communs
- Skill en lecture seule : il inspecte la sécurité déclarée sur un modèle.
- Distingue toujours ACL, record rules et groupes.

## odoo_inspect_security
Utilise `odoo_inspect_security` pour diagnostiquer droits d'accès, visibilité partielle et règles multi-société.

## Quand l'utiliser
- L'utilisateur ne voit pas des enregistrements, menus, boutons ou actions.
- Une opération échoue par accès refusé.
- Tu dois expliquer pourquoi un comptage peut être partiel.
- L'utilisateur demande s'il existe des règles de sécurité particulières dans
  des modules custom : identifie d'abord les modèles et fichiers de sécurité du
  dépôt, puis inspecte les modèles live concernés.

## Bonnes pratiques
- Inspecte le modèle exact concerné.
- Si aucun modèle exact n'est donné, combine `repo_list_modules`,
  `repo_search_code` et `repo_read_file` pour repérer les fichiers
  `security/ir.model.access.csv`, XML avec `ir.rule`, groupes et external ids.
- ACL = droits CRUD globaux par groupe ; record rules = filtre sur les enregistrements.
- Cite les groupes et domains de règles qui expliquent le symptôme.
- Complète avec `odoo_inspect_navigation` si le problème concerne la navigation.

## Déclencheurs
- Accès refusé, records manquants, menus/boutons invisibles, droits, groupes, multi-société.
- Incohérence entre deux utilisateurs.

## Séquence recommandée
1. Identifie le modèle exact.
2. Appelle `odoo_inspect_security`.
3. Si le symptôme est UI, ajoute `odoo_inspect_navigation` et `odoo_inspect_view`.
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
- `odoo_query_records` / `odoo_count_records` pour mesurer l'effet visible.
- `repo_search_code` pour règles custom.
- `odoo_inspect_navigation` pour navigation et actions.

## Critères de réponse
- Séparer ACL, record rules, groupes, effet concret et vérification recommandée.
