---
name: read_target_file
label: Lire un fichier cible
label_en: Read target file
kind: tool
group: target
builtin: false
read_only: true
risk_level: low
description: "Lire un fichier des sources Odoo de la version cible d'une migration."
description_en: Read a source file from the migration target version.
requirement: Sources cible téléchargées
requirement_en: Downloaded target sources
modes: [migration]
keywords: [migration, target, version cible, fichier cible]
code_path: odoo_consultant_portal/skills/read-target-file/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il lit un fichier de la version cible.
- Sépare clairement observations source et cible.

## read_target_file
Utilise `read_target_file` après `search_target_source` pour lire l'implémentation cible.

## Quand l'utiliser
- Tu dois confirmer le comportement exact dans la version d'arrivée.
- Tu compares une méthode, vue, modèle ou champ entre versions.
- Tu rédiges une action de migration technique.

## Bonnes pratiques
- Cite le chemin cible.
- Compare avec `read_odoo_file` côté source si nécessaire.
- Ne généralise pas un changement sans preuve dans les deux versions.

## Déclencheurs
- Après `search_target_source`, besoin de confirmer l'implémentation cible.

## Séquence recommandée
1. Lis la zone cible autour du symbole.
2. Lis la source équivalente avec `read_odoo_file`.
3. Conclus uniquement sur les différences vérifiées.

## Paramètres
- `path`, `start_line`, `end_line`.

## Pièges
- Une méthode peut être déplacée vers un mixin ou un service.
- Un changement cible doit être relié au module exact.

## Combinaisons
- `search_target_source` avant lecture.
- `read_project_file` pour adapter le custom.

## Critères de réponse
- Citer fichier/lignes cible et action de migration.
