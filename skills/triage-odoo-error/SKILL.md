---
name: triage_odoo_error
aliases: [classify_odoo_error, diagnose_traceback, analyse_log_odoo]
label: Triage erreur Odoo
label_en: Triage Odoo error
kind: tool
group: core
builtin: true
read_only: true
risk_level: low
description: "Classer un message d'erreur ou un log Odoo dans la bonne catégorie de cause racine : bug code source Odoo standard, customisation Studio, module custom client, donnée incorrecte, ou problème de migration. Parse le traceback Python (frame innermost, classe d'exception, module, chemin de fichier), applique des règles déterministes puis propose la prochaine action (lire la source, interroger Odoo, vérifier les customisations Studio, etc.). À utiliser quand l'utilisateur colle un traceback, un log d'erreur Odoo, un message UserError/ValidationError, ou demande « d'où vient ce bug ». Ne pas utiliser pour générer du code de correction (utiliser source_read_odoo_file + l'agent developer après triage) ni pour analyser un comportement métier sans erreur technique."
description_en: "Classify an Odoo error message or log into the right root-cause family: standard Odoo source-code bug, Studio customisation, custom client module, incorrect data, or migration issue. Parses the Python traceback (innermost frame, exception class, module, file path), applies deterministic rules, then proposes the next step (read source, query Odoo, check Studio customisations, etc.). Use when the user pastes a traceback, an Odoo error log, a UserError/ValidationError message, or asks 'where is this bug coming from'. Do not use to write a fix (use source_read_odoo_file + the developer agent after triage) or to analyse business behaviour without a technical error."
requirement: Aucun (analyse de texte). Si le verdict suggère une vérification live, une connexion Odoo aidera ensuite.
requirement_en: None (text analysis). If the verdict suggests a live check, an Odoo connection helps next.
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration]
keywords: [
  "traceback", "log d'erreur", "log derreur", "log error", "stack trace", "stacktrace",
  "userError", "user error", "validationError", "validation error", "missingError",
  "integrityError", "psycopg", "psycopg2", "exception odoo", "exception python",
  "exception remonte", "exception en prod", "exception en production",
  "cause racine", "root cause", "type d'erreur", "categoriser l'erreur",
  "categorise l'erreur", "categoriser ce bug", "peux-tu la classer", "peux-tu le classer",
  "does not exist", "column does not", "n'existe pas", "doesn't exist",
  "qu'est-ce qui cause", "d'où vient ce bug", "d'où vient cette erreur", "what causes this",
  "where does this error come from", "diagnose error", "diagnostiquer erreur",
  "classer l'erreur", "classer cette erreur", "classifier l'erreur", "triage", "trier l'erreur",
  "studio, custom, data", "studio ou data", "code ou data", "data ou studio",
  "bug studio", "bug code source", "bug data", "bug donnée", "bug donnee", "data corruption",
  "erreur upgrade", "migration error", "erreur de migration",
  "column does not exist", "relation does not exist",
  "field does not exist on model"
]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: none
code_path: skills/triage-odoo-error/scripts/handler.py
references_auto_load:
  - file: triage_decision_tree.md
    triggers: [traceback, "stack trace", "validation error", "user error", "psycopg"]
  - file: migration_error_patterns.md
    triggers: [migration, upgrade, "column does not exist", "field does not exist on model", "ir.model.data"]
allow_implicit_invocation: true
---

## triage_odoo_error — playbook

Tu reçois un traceback, un log ou un message d'erreur Odoo. Ton job est de **classer** la cause racine avant d'orienter le diagnostic. Tu ne corriges pas — tu produis un verdict, une preuve et la prochaine action.

## Quand l'utiliser

- L'utilisateur colle un traceback Python, un log d'erreur Odoo ou un message `UserError`/`ValidationError`.
- L'utilisateur demande explicitement « d'où vient ce bug ? », « c'est studio ou code custom ? », « classe cette erreur entre studio, data, source ».
- Avant de proposer un fix : on **trie** d'abord, on corrige ensuite (pas l'inverse).
- En contexte migration : indispensable, c'est le premier filtre pour distinguer ce qui vient de la migration de ce qui existait déjà.

## Quand NE PAS l'utiliser

- Pour générer un code de correction → utiliser `source_read_odoo_file` (puis basculer sur l'agent developer si nécessaire).
- Pour analyser un comportement métier sans erreur technique → utiliser `odoo_inspect_view` ou `odoo_inspect_navigation`.
- Pour expliquer un message d'erreur **business** documenté (ex : « Vous ne pouvez pas annuler une facture validée ») — c'est de la formation utilisateur, pas du triage technique.

## Catégories cibles (mutuellement exclusives, priorité du haut vers le bas)

1. **migration** — la base est en cours ou vient de finir une migration de version. Symptômes : `Field X does not exist on model Y`, `column "X" does not exist`, `ir.model.data not found`, script d'upgrade qui plante, `ParseError` sur une vue legacy, références à des champs renommés/supprimés. Ces erreurs sont **temporaires** mais coûteuses : elles doivent être traitées avant tout autre triage parce que l'environnement n'est pas dans un état nominal.

2. **studio** — la modification vient de Studio (Studio Customization, champs `x_studio_*`, vues `studio_view`). Symptômes : traceback dans `web_studio/`, modèles `x_*` créés via UI, champs `x_studio_*` référencés. Ne **jamais** corriger côté code, toujours via l'interface Studio.

3. **custom_dev** — le bug vient d'un module custom client (repo client, OCA non standard, dev interne). Symptômes : traceback dans un module non standard, chemin sous `repos/<profile>/`, nom de module non Odoo/Enterprise/OCA officiel. Diagnostic à faire dans le repo client.

4. **source_code** — le bug est dans le code Odoo standard (Community ou Enterprise). Symptômes : traceback purement dans `/odoo/addons/<module>/` ou `/enterprise/<module>/` sur un module standard, **et** le comportement n'est pas explicable par data ou config. **Rare** : 95 % des « bugs Odoo » sont en réalité data/Studio/custom. Toujours vérifier la version (changelog Odoo, commit récent).

5. **data** — l'erreur est déclenchée par une **donnée** non conforme : contrainte `_check_*` levée, `UserError` métier, `IntegrityError` PostgreSQL, FK cassée, NULL non autorisé, contexte société incohérent. Aucun code à modifier, la donnée doit être corrigée (ou la contrainte assouplie après validation).

## Méthode

1. **Appelle le handler `triage_odoo_error`** avec le texte brut du log/traceback (argument `text`).
2. Le handler retourne `{verdict, confidence, evidence, parsed, next_steps, migration_relevance}`.
3. **Rends la classification telle quelle** avec une phrase d'explication courte : ne ré-interprète pas si la confiance est `high`.
4. **Si la confiance est `low`**, demande à l'utilisateur :
   - la version Odoo cible et source (si migration suspectée)
   - si Studio est utilisé sur cette base
   - le module qui plante (s'il n'est pas évident)
5. Ensuite, propose **une seule prochaine action** (pas un menu) :
   - `migration` → `compare_odoo_versions` ou `migration_search_target_source`
   - `studio` → `inspect_studio`
   - `custom_dev` → `repo_search_code` + `repo_read_file` sur le repo client
   - `source_code` → `source_read_odoo_file` + `source_show_commit` pour vérifier l'historique récent
   - `data` → `odoo_query_records` ou `odoo_count_records` pour confirmer la non-conformité

## Format de réponse attendu

```markdown
**Verdict** : `<categorie>` (confiance `<level>`)
**Frame coupable** : `<file>:<line>` — `<module>`
**Type d'exception** : `<ExceptionClass>` — `<message>`
**Évidence** :
- <ligne du traceback ou du log>
- <règle déclenchée>
**Prochaine action** : `<skill ou demande>` — pourquoi en une phrase
**Pertinence migration** : `<high|medium|low|none>` — pourquoi en une phrase
```

## Pièges à éviter

- Ne **jamais** conclure `source_code` sans avoir éliminé `data` et `studio` d'abord — c'est le piège #1 du débutant Odoo.
- Un `UserError` n'est **jamais** un bug code, c'est par définition une donnée ou un usage non conforme.
- Une trace dans `account.move._check_balanced` n'est pas un bug d'`account.move`, c'est une donnée déséquilibrée — verdict `data`.
- En contexte migration, **tout** verdict autre que `migration` doit être justifié explicitement (« cette erreur existerait aussi sur une base non migrée parce que… »).
- Si la trace est tronquée (moins de 3 frames), demande la trace complète plutôt que de deviner.
