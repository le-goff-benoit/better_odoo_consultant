# review_descriptions_skills_codex.md — Audit et amélioration des descriptions de skills

## Objectif

Ce document guide Codex pour auditer et améliorer la `description` de chaque skill du repository.

La demande est volontairement ciblée : **améliorer la qualité des descriptions de skills sans inventer leur comportement**.

La description est critique car elle sert à la découverte et au déclenchement du skill. Un skill peut être très bien écrit, avec de bonnes références et de bons scripts, mais rester inutile si sa description ne permet pas au runtime de le sélectionner au bon moment.

À l’inverse, une description trop large peut déclencher le mauvais skill, charger du contexte inutile et dégrader la qualité des réponses.

---

## Sources à utiliser

Codex doit s’appuyer sur ces sources, sans extrapoler au-delà de ce qu’elles disent :

```text
OpenAI — Agent Skills for Codex
https://developers.openai.com/codex/skills

Anthropic — Agent Skills overview
https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

Anthropic — Skill authoring best practices
https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

Anthropic — Equipping agents for the real world with Agent Skills
https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

Agent Skills — Best practices for skill creators
https://agentskills.io/skill-creation/best-practices

Agent Skills — Optimizing skill descriptions
https://agentskills.io/skill-creation/optimizing-descriptions
```

Documents internes déjà présents dans le repo à relire aussi :

```text
architecture_backend_skills_ia.md
instructions_codex_analyse_skills_multi_llm.md
resume_bonnes_pratiques_agent_skills.md
optimisation_descriptions_skills_et_tests.md
audit_fonctionnement_skills.md
plan.md
```

---

## Règle stricte : ne rien inventer

Codex ne doit pas inventer la finalité d’un skill.

Pour chaque skill, Codex doit déduire le comportement uniquement depuis :

```text
- le nom du dossier ;
- le frontmatter du SKILL.md ;
- le corps du SKILL.md ;
- les références explicitement liées ;
- les scripts présents ;
- les templates présents ;
- le code du runtime si nécessaire ;
- les usages ou tests existants.
```

Si le contenu du skill ne permet pas de comprendre clairement son rôle, Codex doit le signaler.

Dans ce cas, Codex ne doit pas “deviner” une description séduisante. Il doit proposer une description prudente ou demander de clarifier le scope.

---

## Rappel des principes documentés

### 1. Progressive disclosure

Les architectures OpenAI, Anthropic et Agent Skills reposent sur le même principe général :

```text
1. Le runtime découvre les skills.
2. Il charge seulement les métadonnées légères : name, description, path.
3. Il compare la demande utilisateur aux descriptions.
4. Il charge le SKILL.md complet seulement si le skill est pertinent.
5. Il charge ensuite les références/scripts/assets seulement si nécessaire.
```

Conséquence :

```text
La description est un signal de routage, pas une simple phrase marketing.
```

---

### 2. La description doit permettre le déclenchement

D’après OpenAI, l’invocation implicite dépend de la `description`, qui doit être concise, avec un scope et des limites claires. OpenAI recommande aussi de front-loader les cas d’usage et mots-clés importants, car les descriptions peuvent être raccourcies dans de grands ensembles de skills.

D’après Anthropic, la description permet la discovery du skill et doit inclure à la fois :

```text
- ce que le skill fait ;
- quand l’utiliser.
```

D’après Agent Skills, la description porte une grande partie de la responsabilité du déclenchement, car c’est ce que l’agent voit avant de charger le SKILL.md complet.

---

### 3. La description doit rester concise

Contraintes à respecter :

```text
- description non vide ;
- maximum 1024 caractères ;
- pas de balises XML ;
- assez courte pour ne pas polluer le contexte initial ;
- assez explicite pour déclencher correctement.
```

Anthropic recommande aussi un `name` :

```text
- maximum 64 caractères ;
- lowercase ;
- lettres, chiffres et tirets ;
- sans mots réservés propres à Anthropic.
```

Même si notre runtime interne n’impose pas exactement ces règles, Codex doit les utiliser comme garde-fous de compatibilité.

---

### 4. La description doit parler d’intention utilisateur

Une bonne description décrit ce que l’utilisateur veut accomplir.

Elle ne doit pas décrire principalement l’implémentation interne.

Mauvais exemple :

```yaml
description: Loads references/qweb.md and runs validate_xml.py.
```

Meilleur exemple :

```yaml
description: >
  Reviews and debugs Odoo QWeb reports, XML report templates, inherited views
  and rendering errors. Use when the user asks to fix, validate or review an
  Odoo report before deployment.
```

---

### 5. La description doit éviter les deux pièges

#### Trop large

Exemple :

```yaml
description: Use this skill for Odoo.
```

Risque :

```text
Le skill peut se déclencher pour des emails client, de l’explication fonctionnelle,
des résumés commerciaux ou des demandes non techniques.
```

#### Trop étroite

Exemple :

```yaml
description: Use this skill for QWeb XML.
```

Risque :

```text
Le skill peut ne pas se déclencher quand l’utilisateur parle d’un rapport cassé,
d’une erreur de rendu, d’une traceback ou d’un problème PDF Odoo sans dire “QWeb”.
```

---

## Style recommandé pour nos descriptions

Il existe une légère différence de style entre les sources :

```text
- Agent Skills recommande une formulation d’action du type “Use this skill when...”.
- OpenAI recommande d’expliquer précisément quand le skill doit et ne doit pas se déclencher.
- Anthropic recommande une description en troisième personne, spécifique, incluant quoi + quand.
```

Pour notre application multi-LLM, utiliser un style compatible avec les trois :

```yaml
description: >
  Reviews and debugs Odoo modules, XML views, QWeb reports, security rules and
  migration scripts. Use when the user asks for technical Odoo troubleshooting,
  deployment review, traceback analysis or upgrade-safety checks. Do not use
  for client emails, functional explanations or commercial summaries.
```

Ce pattern contient :

```text
- ce que le skill fait ;
- quand l’utiliser ;
- quelques déclencheurs implicites ;
- les limites importantes ;
- une formulation compatible avec discovery multi-LLM.
```

---

## Mission de Codex

Codex doit auditer chaque skill existant et améliorer sa description.

Pour chaque skill, Codex doit :

```text
1. Lire le SKILL.md.
2. Lire les fichiers de référence nécessaires pour comprendre le scope.
3. Identifier la finalité réelle du skill.
4. Identifier les cas où il doit se déclencher.
5. Identifier les cas où il ne doit pas se déclencher.
6. Évaluer la description actuelle.
7. Proposer une description améliorée.
8. Vérifier la limite de 1024 caractères.
9. Proposer des trigger tests positifs et négatifs.
10. Signaler les overlaps avec d’autres skills.
```

---

## Analyse à produire pour chaque skill

Format attendu :

```markdown
# Skill: [skill-name]

## 1. Rôle réel observé

Décrire le rôle réel du skill d’après son contenu.

## 2. Description actuelle

```yaml
description: ...
```

## 3. Problèmes détectés

- Trop vague ?
- Trop large ?
- Trop étroite ?
- Trop orientée implémentation ?
- Manque de cas d’usage ?
- Manque de limites ?
- Risque de chevauchement avec un autre skill ?
- Dépasse 1024 caractères ?
- Terminologie incohérente avec le SKILL.md ?

## 4. Description proposée

```yaml
description: >
  ...
```

## 5. Justification

Expliquer pourquoi la description proposée devrait mieux déclencher le skill.

## 6. Quand ce skill doit se déclencher

- ...
- ...
- ...

## 7. Quand ce skill ne doit pas se déclencher

- ...
- ...
- ...

## 8. Trigger tests proposés

### Should trigger

```json
[
  {
    "query": "...",
    "should_trigger": true,
    "expected_skill": "[skill-name]",
    "category": "positive",
    "language": "fr"
  }
]
```

### Should not trigger / near misses

```json
[
  {
    "query": "...",
    "should_trigger": false,
    "expected_skill": null,
    "category": "near_miss",
    "language": "fr"
  }
]
```

## 9. Risques de chevauchement

Lister les skills proches et les frontières à clarifier.

## 10. Priorité

P0 / P1 / P2 / P3
```

---

## Critères d’évaluation d’une bonne description

Pour chaque description, Codex doit vérifier :

```text
- La description est-elle non vide ?
- Reste-t-elle sous 1024 caractères ?
- Explique-t-elle ce que fait le skill ?
- Explique-t-elle quand l’utiliser ?
- Décrit-elle l’intention utilisateur plutôt que l’implémentation ?
- Inclut-elle les cas implicites importants ?
- Front-load-t-elle les mots-clés importants ?
- Définit-elle des limites si le skill est proche d’autres skills ?
- Évite-t-elle les phrases vagues comme “helps with”, “does stuff”, “general assistant” ?
- Évite-t-elle d’être trop large ?
- Évite-t-elle d’être trop étroite ?
- Reste-t-elle fidèle au contenu réel du SKILL.md ?
```

---

## Critères de priorisation

### P0 — Bloquant

À corriger immédiatement :

```text
- description manquante ;
- description vide ;
- description invalide ;
- description mensongère par rapport au contenu réel ;
- description tellement large qu’elle peut déclencher massivement le mauvais skill ;
- deux skills quasi impossibles à distinguer par leur description.
```

### P1 — Important

À corriger avant de considérer le runtime fiable :

```text
- description trop vague ;
- description qui manque de cas d’usage importants ;
- description qui ne définit pas les frontières avec des skills voisins ;
- description trop orientée implémentation ;
- description qui ne contient pas les mots-clés utiles au déclenchement.
```

### P2 — Amélioration

À améliorer progressivement :

```text
- formulation moins claire ;
- manque de précision sur les cas implicites ;
- description un peu longue ;
- style incohérent entre skills.
```

### P3 — Plus tard

```text
- harmonisation cosmétique ;
- optimisation fine après trigger tests ;
- ajustement multi-provider avancé.
```

---

## Matrice de chevauchement

Codex doit créer une matrice des skills proches.

Exemple :

```text
Skill A              | Skill B              | Chevauchement | Risque | Recommandation
-------------------- | -------------------- | ------------- | ------ | --------------
odoo-code-review     | odoo-functional-help  | Odoo          | Moyen  | Clarifier technique vs fonctionnel
client-email-writer  | project-summary       | rédaction     | Moyen  | Clarifier email externe vs synthèse interne
data-analysis        | spreadsheet-editing   | tableurs      | Élevé  | Clarifier analyse vs modification fichier
```

Cette matrice est importante : beaucoup de mauvais routages viennent de descriptions qui se recouvrent trop.

---

## Trigger tests à proposer pour chaque skill

Pour chaque skill important, Codex doit proposer environ :

```text
8 à 10 requêtes positives
8 à 10 requêtes négatives ou near misses
```

Les requêtes positives doivent varier selon :

```text
- formulation formelle ;
- formulation casual ;
- fautes ou abréviations ;
- demande explicite ;
- demande implicite ;
- prompt court ;
- prompt long ;
- français ;
- anglais si pertinent ;
- contexte métier ;
- fichiers ou chemins ;
- logs ou tracebacks si pertinent.
```

Les requêtes négatives doivent surtout être des near misses.

Un near miss est une demande proche du domaine du skill, mais qui nécessite autre chose.

Exemple pour un skill Odoo technique :

```text
Should trigger:
- Peux-tu vérifier cette vue XML Odoo 18 avant déploiement ?
- J’ai une erreur QWeb sur mon rapport de contrat client, peux-tu analyser le template ?
- Check this module for access rights and record rule issues.

Should not trigger:
- Peux-tu écrire un email de suivi à un client Odoo ?
- Explique Odoo CRM à un utilisateur métier.
- Prépare une synthèse commerciale du projet Odoo.
```

---

## Format conseillé pour eval_queries.json

Codex doit proposer ce format :

```json
[
  {
    "query": "Peux-tu vérifier cette vue XML Odoo 18 avant déploiement ?",
    "should_trigger": true,
    "expected_skill": "odoo-code-review",
    "category": "positive",
    "language": "fr",
    "notes": "technical XML/Odoo review intent"
  },
  {
    "query": "Peux-tu écrire un email de suivi à un client Odoo après le workshop ?",
    "should_trigger": false,
    "expected_skill": "client-email-writer",
    "category": "near_miss",
    "language": "fr",
    "notes": "mentions Odoo but user intent is client communication"
  }
]
```

Si notre runtime supporte plusieurs skills, Codex peut aussi proposer :

```json
{
  "expected_primary_skill": "odoo-code-review",
  "expected_secondary_skills": ["client-summary"]
}
```

Seulement si le runtime supporte réellement cette notion.

Ne pas inventer de structure que le backend ne peut pas lire.

---

## Procédure de review recommandée

Codex doit suivre cette procédure :

```text
1. Lister tous les skills.
2. Pour chaque skill, extraire name + description + scope + fichiers associés.
3. Lire le SKILL.md complet.
4. Identifier la finalité réelle.
5. Comparer finalité réelle vs description actuelle.
6. Détecter les risques de faux positifs et faux négatifs.
7. Proposer une description améliorée.
8. Vérifier 1024 caractères.
9. Proposer des trigger tests.
10. Construire une matrice de chevauchement.
11. Classer les corrections par priorité.
12. Ne modifier les fichiers que si le contexte du projet le demande explicitement.
```

---

## Règles de rédaction des descriptions proposées

### À faire

```text
- Décrire l’intention utilisateur.
- Inclure les cas d’usage principaux.
- Inclure les formulations implicites importantes.
- Ajouter des limites si le skill est proche d’autres skills.
- Garder la description concise.
- Utiliser une terminologie cohérente avec le SKILL.md.
- Front-loader les mots-clés importants.
- Rester fidèle au contenu réel du skill.
```

### À éviter

```text
- “Helps with...”
- “General assistant for...”
- “Handles all things related to...”
- Descriptions purement techniques internes.
- Descriptions trop longues.
- Descriptions qui promettent des capacités absentes.
- Descriptions qui recouvrent entièrement un autre skill.
- Ajout de mots-clés uniquement pour faire passer un test.
```

---

## Exemples de correction

### Exemple 1 — Trop vague

Avant :

```yaml
description: Odoo helper.
```

Après :

```yaml
description: >
  Reviews and debugs Odoo modules, XML views, QWeb reports, security rules and
  migration scripts. Use when the user asks for technical troubleshooting,
  deployment review, traceback analysis, upgrade-safety checks or module
  validation. Do not use for client emails or general functional explanations.
```

---

### Exemple 2 — Trop orientée implémentation

Avant :

```yaml
description: Loads qweb.md and checks XML.
```

Après :

```yaml
description: >
  Reviews Odoo QWeb reports and XML report templates for rendering errors,
  inheritance issues and deployment risks. Use when the user mentions broken
  reports, QWeb tracebacks, PDF rendering problems or report template changes.
```

---

### Exemple 3 — Trop large

Avant :

```yaml
description: Use this skill for documents.
```

Après :

```yaml
description: >
  Creates and edits structured business documents from user-provided notes,
  outlines or source material. Use when the user asks for a report, brief,
  meeting recap or formatted Markdown document. Do not use for code review,
  data analysis or casual chat.
```

---

## Ce que Codex ne doit pas faire

Codex ne doit pas :

```text
- réécrire tout le SKILL.md sauf demande explicite ;
- modifier la logique backend ;
- ajouter des scripts non demandés ;
- inventer des capacités ;
- supprimer des limites utiles ;
- rendre toutes les descriptions génériques ;
- optimiser uniquement pour des mots-clés ;
- ignorer les overlaps entre skills ;
- proposer une description sans trigger tests associés.
```

---

## Livrable attendu

Codex doit produire :

```markdown
# Audit des descriptions de skills

## 1. Résumé exécutif

## 2. Sources utilisées

## 3. Liste des skills audités

## 4. Problèmes globaux observés

## 5. Recommandations globales de style

## 6. Audit par skill

### [skill-name]
- Rôle réel observé
- Description actuelle
- Problèmes
- Description proposée
- Justification
- Should trigger
- Should not trigger
- Risques de chevauchement
- Priorité

## 7. Matrice de chevauchement

## 8. Fichiers à modifier

## 9. eval_queries.json proposés

## 10. Priorités d’exécution

## 11. Questions ouvertes
```

---

## Option : appliquer directement les modifications

Si Codex est autorisé à modifier le repo, il peut ensuite :

```text
1. Mettre à jour les descriptions dans les SKILL.md.
2. Créer ou compléter eval_queries.json pour les skills prioritaires.
3. Ajouter un rapport Markdown dans docs/ ou reports/.
```

Mais il doit d’abord produire l’audit et éviter les modifications massives sans justification.

---

## Critère de succès

L’audit est réussi si, pour chaque skill important, on obtient :

```text
- une description plus précise ;
- une meilleure frontière avec les autres skills ;
- des cas où le skill doit se déclencher ;
- des cas où il ne doit pas se déclencher ;
- un premier jeu de trigger tests ;
- une priorité claire ;
- aucune invention de comportement.
```

Phrase directrice :

```text
Une bonne description ne vend pas le skill.
Elle explique au runtime quand le charger et quand ne pas le charger.
```