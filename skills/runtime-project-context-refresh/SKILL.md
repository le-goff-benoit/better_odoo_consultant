---
name: runtime_project_context_refresh
aliases: [project_context_refresh]
label: Rafraîchir le contexte projet
label_en: Refresh project context
kind: core
group: core
builtin: true
read_only: true
risk_level: low
description: "Action UI de rafraîchissement projet déclenchée par le bouton « Rafraîchir » du panneau contexte de l'Assistant : git pull du dépôt, ping XML-RPC Odoo, recalcul de la localisation pays, recalcul de la complexité technique, régénération du contexte projet. Utiliser uniquement quand l'utilisateur déclenche ce bouton. Ne pas invoquer automatiquement à chaque tour ni pour un rafraîchissement implicite."
description_en: "Project-refresh UI action triggered by the Assistant context panel 'Refresh' button: git pull of the repo, Odoo XML-RPC ping, country localization recompute, technical complexity recompute, project context regeneration. Use only when the user clicks that button. Do not invoke automatically each turn or for implicit refresh."
requirement: Projet sélectionné
requirement_en: Selected project
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant]
keywords: [rafraîchir, refresh, régénérer]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: backend/api/routes/profiles.py
---

## runtime_project_context_refresh (skill cœur — action UI)

Action déclenchée par le bouton « Rafraîchir » du panneau de contexte de l'Assistant.

## Sous-étapes (isolées — un échec n'arrête pas les autres)
1. Vérifier l'accès Odoo (XML-RPC ping).
2. `git pull` sur le dépôt custom de l'environnement actif.
3. Détecter la localisation (companies → country_code).
4. Recalculer la complexité technique (vanilla / Studio / dev / mixte).
5. Régénérer `project-context.md` via Claude (`auto_fill_context()`).

## Sortie
- Toast UI multi-étapes listant le résultat de chacune (✓ / ⚠ / ✗).
- Le contexte projet régénéré est immédiatement injecté dans la prochaine question.

## Désactivé
- Le bouton « Rafraîchir » disparaît du panneau de contexte.
- L'assistant continue de fonctionner mais avec le contexte projet figé à la dernière régénération.

## Déclencheurs
- Clic utilisateur sur le bouton refresh du panneau contexte Assistant.

## Séquence recommandée
1. Exécuter les sous-étapes indépendamment.
2. Conserver les succès même si une étape échoue.
3. Afficher un résumé court et exploitable.

## Paramètres
- Profil, environnement actif, société active.

## Pièges
- Ne pas bloquer toute la mise à jour si le dépôt Git ou la clé IA échoue.

## Combinaisons
- `runtime_localization_detector` et `runtime_complexity_analyzer` alimentent le prochain contexte.

## Critères de réponse
- Toast clair : accès, repo, localisation, complexité, contexte régénéré.
