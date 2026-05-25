# audit_fonctionnement_skills.md — Audit de fonctionnement du runtime de Skills IA

## Objectif

La migration/refactoring de l’architecture des skills est terminée. Ce document guide Codex dans un **audit de fonctionnement réel** du système.

Le but n’est pas seulement de vérifier que le code compile ou que les classes existent. Le but est de vérifier que l’architecture apporte effectivement un gain de qualité.

Les points les plus critiques à contrôler sont :

```text
- découverte des skills ;
- parsing des manifests ;
- compréhension des descriptions ;
- routage implicite et explicite ;
- chargement progressif ;
- utilisation correcte des références ;
- utilisation correcte des scripts ;
- comportement multi-LLM ;
- logs et capacité d’expliquer pourquoi un skill a été utilisé ;
- qualité finale des réponses avec et sans skills.
```

---

## Contexte

L’application utilise une architecture de skills inspirée des standards OpenAI / Anthropic / Agent Skills.

L’application peut fonctionner avec plusieurs LLM selon la configuration utilisateur. Le runtime de skills doit donc appartenir au backend de l’application, et ne pas dépendre exclusivement d’un provider.

Principe cible :

```text
Le skill est un package.
Le backend est le runtime.
Le LLM est interchangeable.
OpenAI, Anthropic et les autres providers sont des adapters.
```

Les documents présents dans le repository doivent être relus avant l’audit :

```text
architecture_backend_skills_ia.md
instructions_codex_analyse_skills_multi_llm.md
resume_bonnes_pratiques_agent_skills.md
recommandations_ui_skills_ia.md
plan.md
```

---

## Livrable attendu de Codex

Codex doit produire un rapport structuré :

```markdown
# Audit de fonctionnement du runtime de Skills IA

## 1. Résumé exécutif
## 2. Architecture réellement observée
## 3. Audit de découverte des skills
## 4. Audit du parsing des manifests
## 5. Audit du routage implicite et explicite
## 6. Audit du progressive loading
## 7. Audit de l’exécution multi-LLM
## 8. Audit des permissions et scripts
## 9. Audit de l’observabilité
## 10. Audit qualité : avec skills vs sans skills
## 11. Bugs ou incohérences détectés
## 12. Risques actuels
## 13. Recommandations prioritaires
## 14. Tests à ajouter
## 15. Verdict final
```

Le verdict final doit répondre clairement :

```text
L’architecture actuelle améliore-t-elle réellement la qualité ?
Oui / Non / Partiellement
```

---

# 1. Audit global

Codex doit vérifier le fonctionnement réel du runtime, pas seulement l’existence des fichiers.

Pour chaque composant, répondre :

```text
- Est-ce que le composant existe ?
- Est-ce qu’il est réellement utilisé ?
- Est-ce qu’il est appelé au bon moment ?
- Est-ce qu’il produit des logs exploitables ?
- Est-ce qu’il respecte le design prévu ?
- Est-ce qu’il améliore la qualité ou ajoute seulement de la complexité ?
```

Composants à vérifier ou mapper vers leurs équivalents réels :

```text
SkillRegistry
ManifestParser
SkillRouter
SkillLoader
ExecutionEngine
PolicyEngine
ScriptExecutor
ContextManager
OutputRenderer
Logger
ProviderAdapter
OpenAIAdapter
AnthropicAdapter
GenericLLMAdapter
```

Si certains composants ont été fusionnés ou renommés, Codex doit indiquer leur équivalent.

---

# 2. Audit de la découverte des skills

## Objectif

Vérifier que les skills sont découverts correctement, de manière stable, prévisible et sécurisée.

## Points à contrôler

```text
- Où les skills sont-ils stockés ?
- Le système scanne-t-il les bons dossiers ?
- Supporte-t-il .agents/skills si prévu ?
- Supporte-t-il les scopes core / project / user / organization ?
- Comment les doublons sont-ils gérés ?
- Que se passe-t-il si deux skills ont le même name ?
- Que se passe-t-il si un SKILL.md manque ?
- Que se passe-t-il si un manifest est invalide ?
- Les skills désactivés sont-ils bien exclus du routing ?
- Les skills verrouillés sont-ils bien protégés ?
- Les erreurs de découverte sont-elles visibles dans les logs/UI ?
```

## Tests à proposer ou implémenter

```text
- un skill valide est découvert ;
- un skill sans SKILL.md est ignoré ou marqué invalide ;
- un skill avec YAML invalide est signalé ;
- deux skills avec le même name produisent un warning ou une erreur claire ;
- un skill disabled n’est pas sélectionnable ;
- un skill locked ne peut pas être désactivé par erreur ;
- un skill project peut coexister avec un skill core selon la règle prévue ;
- les scopes sont correctement exposés à l’UI.
```

## Conclusion attendue

```text
La découverte des skills est-elle fiable ?
Les erreurs sont-elles visibles ?
Le système peut-il expliquer pourquoi un skill est disponible ou non ?
```

---

# 3. Audit du parsing des manifests

## Objectif

Vérifier que `SKILL.md` est lu correctement et que le frontmatter est validé.

## Points à contrôler

```text
- name est-il obligatoire ?
- description est-elle obligatoire ?
- description est-elle utilisée pour le routing ?
- version est-elle supportée si prévue ?
- tags sont-ils supportés si prévus ?
- permissions sont-elles parsées ?
- outputs sont-ils parsés ?
- agents/openai.yaml est-il lu si présent ?
- les champs internes sont-ils namespacés ou documentés ?
- les chemins relatifs sont-ils validés ?
- les erreurs de parsing sont-elles explicites ?
```

## Contraintes de compatibilité raisonnables

Pour rester proche du format Agent Skills :

```text
- name non vide ;
- description non vide ;
- description orientée déclenchement ;
- name idéalement lowercase avec lettres, chiffres et tirets ;
- description suffisamment courte ;
- pas de description trop vague.
```

## Tests à proposer ou implémenter

```text
- manifest minimal valide ;
- manifest sans name ;
- manifest sans description ;
- manifest avec description vide ;
- manifest avec YAML invalide ;
- manifest avec chemin ../ ;
- manifest avec permissions inconnues ;
- manifest avec agents/openai.yaml valide ;
- manifest avec agents/openai.yaml invalide.
```

## Conclusion attendue

```text
Le format de skill est-il stable ?
Est-il compatible avec un skill OpenAI/Anthropic minimal ?
Les extensions internes sont-elles propres ?
```

---

# 4. Audit du routage des skills

## Objectif

C’est le point le plus important. Codex doit vérifier que le système comprend correctement **quand** utiliser un skill.

Un skill utile mais mal routé ne sert à rien. Un skill trop souvent déclenché dégrade la qualité.

## Types de routing à vérifier

```text
- routing explicite ;
- routing implicite ;
- routing par description ;
- routing par tags ;
- routing par mots-clés ;
- routing par embeddings si présent ;
- routing par LLM classifier si présent ;
- fallback quand aucun skill n’est pertinent ;
- gestion des scores de confiance ;
- gestion des skills concurrents ;
- respect de allow_implicit_invocation=false.
```

## Questions à traiter

```text
- Comment le router choisit-il un skill ?
- Quels champs sont utilisés ?
- La description est-elle réellement centrale ?
- Les tags servent-ils vraiment ?
- Le router peut-il sélectionner plusieurs skills ?
- Le router sait-il ne sélectionner aucun skill ?
- Le router peut-il expliquer son choix ?
- Le router logge-t-il les candidats et leurs scores ?
- Le router respecte-t-il les skills désactivés ?
- Le router respecte-t-il allow_implicit_invocation=false ?
```

## Tests de routing à créer

Codex doit proposer ou créer un jeu de tests de déclenchement.

Format recommandé :

```json
[
  {
    "query": "Can you review this Odoo 18 QWeb report before deployment?",
    "expected_skill": "odoo-code-review",
    "should_trigger": true
  },
  {
    "query": "Write a friendly follow-up email to the client after our workshop",
    "expected_skill": "client-email-writer",
    "should_trigger": true
  },
  {
    "query": "What is the weather today?",
    "expected_skill": null,
    "should_trigger": false
  }
]
```

Pour chaque skill important, prévoir :

```text
- 8 à 10 requêtes positives ;
- 8 à 10 requêtes négatives ;
- des near misses ;
- des formulations courtes ;
- des formulations longues ;
- des formulations en français ;
- des formulations en anglais si l’app est bilingue ;
- des requêtes ambiguës.
```

## Near misses importants

Les near misses sont plus importants que les négatifs évidents.

Exemple :

```text
Skill: odoo-code-review

Positive:
- Review this Odoo module before deployment.
- Check this XML view for deprecated attrs/states.
- Analyze this QWeb report traceback.

Negative near miss:
- Write a follow-up email to an Odoo client.
- Explain Odoo Sales to a non-technical user.
- Create a logo for an Odoo module.
```

## Conclusion attendue

Codex doit produire :

```text
- une matrice de routing ;
- les faux positifs ;
- les faux négatifs ;
- les cas ambigus ;
- les descriptions à améliorer ;
- les skills trop larges ;
- les skills trop étroits.
```

---

# 5. Audit du progressive loading

## Objectif

Vérifier que le système ne charge pas trop de contexte inutilement.

Principe cible :

```text
1. Charger seulement name + description + path.
2. Router la demande.
3. Charger SKILL.md seulement pour le skill sélectionné.
4. Charger references/templates/scripts seulement si nécessaire.
```

## Points à contrôler

```text
- Tous les SKILL.md sont-ils injectés dans le prompt ?
- Toutes les references sont-elles chargées par défaut ?
- Les scripts sont-ils lus dans le contexte inutilement ?
- Les assets sont-ils ignorés sauf besoin ?
- Le ContextManager connaît-il les fichiers chargés ?
- Existe-t-il un budget de contexte ?
- Les fichiers chargés sont-ils loggés ?
- Le système peut-il expliquer pourquoi une référence a été chargée ?
```

## Anti-patterns à détecter

```text
- injection de tous les skills dans chaque prompt ;
- injection de toutes les references ;
- SKILL.md énormes ;
- documentation générale inutile ;
- références chargées sans condition ;
- prompts monolithiques ;
- absence de logs des fichiers chargés.
```

## Tests à proposer ou implémenter

```text
- requête sans skill pertinent : aucun SKILL.md complet ne doit être chargé ;
- requête qui déclenche un skill : seul ce skill doit être chargé ;
- requête QWeb : seule la référence QWeb doit être chargée ;
- requête sécurité : seule la référence sécurité doit être chargée ;
- requête simple : aucun script ni template inutile ne doit être chargé ;
- requête avec output structuré : le template correspondant doit être chargé.
```

## Mesures utiles

Si possible, mesurer :

```text
- taille du contexte avant migration ;
- taille du contexte après migration ;
- nombre de fichiers chargés ;
- tokens approximatifs ;
- latence.
```

## Conclusion attendue

```text
Le système respecte-t-il réellement le progressive loading ?
Le gain de contexte est-il mesurable ?
```

---

# 6. Audit de l’utilisation réelle des skills dans les réponses

## Objectif

Vérifier que le skill sélectionné influence réellement la réponse finale.

Il ne suffit pas qu’un skill soit détecté. Il faut vérifier qu’il est utilisé.

## Points à contrôler

```text
- Le SKILL.md sélectionné est-il injecté dans le contexte ?
- Les instructions du skill sont-elles visibles dans la réponse finale ?
- Le format de sortie du skill est-il respecté ?
- Les gotchas du skill sont-ils appliqués ?
- Les références chargées sont-elles utilisées ?
- Les scripts exécutés influencent-ils la réponse ?
- L’OutputRenderer applique-t-il le template prévu ?
```

## Tests qualitatifs

Pour plusieurs prompts réels, comparer :

```text
- réponse sans skill ;
- réponse avec skill ;
- réponse avec mauvais skill ;
- réponse avec skill forcé ;
- réponse avec skill désactivé.
```

Critères :

```text
- pertinence ;
- précision ;
- structure ;
- réduction des erreurs ;
- respect du domaine ;
- respect du format ;
- meilleure gestion des cas limites.
```

## Conclusion attendue

```text
Les skills améliorent-ils réellement la qualité finale ?
Dans quels cas oui ?
Dans quels cas non ?
```

---

# 7. Audit multi-LLM

## Objectif

Vérifier que le système fonctionne avec plusieurs providers.

L’application ne doit pas être dépendante d’un seul provider.

## Points à contrôler

```text
- Comment le provider utilisateur est-il choisi ?
- Existe-t-il un ProviderAdapter ?
- Les capabilities du provider sont-elles connues ?
- Le système distingue-t-il native mode et backend-emulated mode ?
- OpenAI fonctionne-t-il ?
- Anthropic fonctionne-t-il ?
- Un provider générique fonctionne-t-il ?
- Les prompts sont-ils adaptés au provider ?
- Les outputs sont-ils validés de manière identique ?
- Les logs indiquent-ils provider + modèle ?
```

## Tests à proposer ou implémenter

Pour les mêmes prompts :

```text
- exécuter avec OpenAI ;
- exécuter avec Anthropic ;
- exécuter avec un provider générique si disponible ;
- comparer le skill sélectionné ;
- comparer les fichiers chargés ;
- comparer la sortie ;
- comparer les erreurs ;
- comparer les temps de réponse.
```

## Cas à vérifier

```text
- provider sans support natif des skills ;
- provider sans code execution ;
- provider sans structured output ;
- provider avec contexte plus limité ;
- provider avec tools indisponibles.
```

## Conclusion attendue

```text
Le runtime est-il réellement provider-agnostic ?
Ou bien reste-t-il couplé à OpenAI/Claude ?
```

---

# 8. Audit des permissions, scripts et sécurité

## Objectif

Vérifier que les scripts et permissions ne sont pas seulement déclarés, mais réellement appliqués.

## Points à contrôler

```text
- permissions filesystem ;
- permissions scripts ;
- permissions network ;
- accès aux tools ;
- accès aux credentials ;
- chemins relatifs ;
- symlinks ;
- timeouts ;
- sandbox ;
- stdout/stderr ;
- exit code ;
- logs de script ;
- refus propre si permission manquante.
```

## Tests à proposer ou implémenter

```text
- script refusé si scripts=false ;
- réseau refusé si network=false ;
- chemin ../ refusé ;
- chemin absolu refusé si non autorisé ;
- symlink dangereux refusé ;
- script trop long interrompu par timeout ;
- erreur script loggée ;
- stdout/stderr capturés ;
- script output trop volumineux tronqué ou limité.
```

## Conclusion attendue

```text
Les permissions sont-elles réellement enforce côté backend ?
Ou seulement déclaratives ?
```

---

# 9. Audit de l’observabilité

## Objectif

Vérifier qu’on peut comprendre ce qui s’est passé après chaque réponse.

Sans logs exploitables, le runtime de skills sera impossible à améliorer.

## Logs minimaux attendus

Pour chaque exécution :

```text
- run_id ;
- prompt utilisateur ;
- provider ;
- modèle ;
- mode native/backend-emulated ;
- skills candidats ;
- scores de routing ;
- skill sélectionné ;
- raison de sélection ;
- fichiers chargés ;
- scripts exécutés ;
- stdout/stderr ;
- erreurs ;
- durée ;
- tokens/coût si disponible ;
- sortie finale ;
- statut final.
```

## Questions à traiter

```text
- Peut-on savoir pourquoi un skill a été choisi ?
- Peut-on savoir pourquoi aucun skill n’a été choisi ?
- Peut-on voir les fichiers chargés ?
- Peut-on voir les scripts exécutés ?
- Peut-on voir le contexte final envoyé au LLM ?
- Peut-on voir le provider utilisé ?
- Peut-on reproduire une exécution ?
- Peut-on comparer deux providers ?
```

## Conclusion attendue

```text
L’observabilité est-elle suffisante pour améliorer les skills ?
```

---

# 10. Audit qualité : avec skills vs sans skills

## Objectif

C’est le contrôle final : vérifier que la nouvelle architecture améliore vraiment les réponses.

## Méthode recommandée

Créer un benchmark simple avec des prompts représentatifs.

Catégories :

```text
- prompt général sans skill attendu ;
- prompt Odoo technique ;
- prompt rédaction email client ;
- prompt analyse projet ;
- prompt migration ;
- prompt ambigu ;
- prompt multi-intention ;
- prompt qui devrait charger une référence ;
- prompt qui devrait exécuter un script ;
- prompt qui ne devrait déclencher aucun skill.
```

Pour chaque prompt, comparer :

```text
A. réponse sans skills ;
B. réponse avec skills auto ;
C. réponse avec skill forcé ;
D. réponse avec mauvais skill forcé si utile.
```

## Critères de qualité

```text
- skill correctement sélectionné ;
- pas de skill sélectionné quand inutile ;
- respect du format attendu ;
- précision ;
- contextualisation ;
- absence de hors-sujet ;
- réduction des hallucinations ;
- meilleure prise en compte des conventions projet ;
- utilisation pertinente des references ;
- qualité supérieure à la baseline sans skill.
```

## Tableau attendu

```text
Prompt | Skill attendu | Skill sélectionné | Correct ? | Qualité vs baseline | Notes
------ | -------------- | ----------------- | --------- | ------------------- | -----
...
```

Verdicts possibles :

```text
- amélioration nette ;
- amélioration partielle ;
- neutre ;
- dégradation ;
- bug.
```

---

# 11. Audit UI de compréhension des skills

## Objectif

Vérifier que l’UI permet de comprendre ce que le runtime fait.

La page de gestion des skills ne doit pas seulement afficher “actif”.

Elle doit permettre de comprendre :

```text
- quels skills existent ;
- quand ils se déclenchent ;
- s’ils sont sains ;
- avec quels providers ils fonctionnent ;
- s’ils ont des tests ;
- quelles ressources ils chargent ;
- quelles ont été leurs dernières exécutions.
```

## Points à contrôler

L’UI affiche-t-elle ou peut-elle afficher :

```text
- scope ;
- statut actif/disabled/locked ;
- description ;
- trigger description ;
- provider compatibility ;
- native vs backend-emulated ;
- health status ;
- trigger tests ;
- recent runs ;
- loaded references ;
- scripts ;
- dependencies ;
- warnings.
```

## Conclusion attendue

```text
L’UI permet-elle de comprendre et auditer le comportement des skills ?
Ou reste-t-elle trop technique / trop opaque ?
```

---

# 12. Red flags à chercher explicitement

Codex doit chercher ces signaux d’alerte :

```text
- Tous les skills sont chargés dans chaque prompt.
- Le router sélectionne toujours un skill même quand aucun n’est pertinent.
- Les descriptions sont trop vagues.
- Plusieurs skills ont des descriptions qui se recouvrent trop.
- Les skills désactivés peuvent encore être sélectionnés.
- allow_implicit_invocation=false n’est pas respecté.
- Le backend dépend d’un provider spécifique.
- Les permissions ne sont pas appliquées.
- Les scripts peuvent accéder au filesystem sans restriction.
- Les erreurs de parsing sont silencieuses.
- Les logs ne permettent pas d’expliquer le choix du skill.
- Le contexte final est impossible à inspecter.
- Les outputs ne respectent pas les templates.
- Les references sont chargées même quand inutiles.
- L’architecture ajoute de la complexité sans améliorer les réponses.
```

---

# 13. Tests d’acceptation minimaux

Codex doit proposer ou implémenter ces tests.

## Test 1 — Aucun skill pertinent

Prompt :

```text
Quel temps fait-il aujourd’hui ?
```

Attendu :

```text
- aucun skill spécialisé sélectionné ;
- éventuellement skill core de contexte seulement ;
- pas de references inutiles chargées.
```

## Test 2 — Skill explicite

Prompt :

```text
/odoo-code-review Review this module before deployment.
```

Attendu :

```text
- skill odoo-code-review sélectionné ;
- sélection marquée comme explicite ;
- routing implicite bypassé ou secondaire ;
- logs clairs.
```

## Test 3 — Skill implicite

Prompt :

```text
Peux-tu vérifier cette vue XML Odoo 18 et me dire si elle utilise encore attrs/states ?
```

Attendu :

```text
- skill Odoo technique sélectionné ;
- référence XML/Odoo 17+ chargée si disponible ;
- réponse mentionne correctement attrs/states ;
- aucun skill email ou rapport client sélectionné.
```

## Test 4 — Near miss

Prompt :

```text
Peux-tu écrire un email de suivi à un client Odoo après notre workshop ?
```

Attendu :

```text
- skill email/rédaction sélectionné si présent ;
- skill odoo-code-review non sélectionné ;
- pas de référence technique Odoo chargée inutilement.
```

## Test 5 — Multi-provider

Même prompt exécuté avec plusieurs providers.

Attendu :

```text
- même skill sélectionné ou différence expliquée ;
- logs provider/model ;
- mode native/emulated visible ;
- qualité comparable.
```

## Test 6 — Skill désactivé

Désactiver un skill puis relancer une requête qui le déclenche normalement.

Attendu :

```text
- skill désactivé non sélectionné ;
- fallback clair ;
- warning ou log explicite.
```

## Test 7 — Script non autorisé

Skill avec script mais permissions scripts=false.

Attendu :

```text
- script non exécuté ;
- refus loggé ;
- réponse indique que la validation déterministe n’a pas été exécutée si pertinent.
```

## Test 8 — Reference conditionnelle

Prompt QWeb puis prompt security.

Attendu :

```text
- prompt QWeb charge seulement qweb.md ;
- prompt security charge seulement security.md ;
- pas de chargement global de toutes les references.
```

---

# 14. Métriques recommandées

## Routing

```text
- trigger accuracy ;
- false positives ;
- false negatives ;
- top-1 skill accuracy ;
- nombre moyen de skills candidats ;
- score moyen de confiance.
```

## Context

```text
- nombre de fichiers chargés par run ;
- taille approximative du contexte ;
- tokens d’instructions ;
- tokens de references ;
- ratio contexte utile / contexte total.
```

## Quality

```text
- qualité vs baseline sans skill ;
- respect du format de sortie ;
- erreurs évitées par skill ;
- cas où le skill dégrade la réponse.
```

## Runtime

```text
- latence ;
- coût ;
- erreurs provider ;
- erreurs scripts ;
- timeouts ;
- taux de réussite.
```

---

# 15. Priorisation des recommandations

Codex doit classer les problèmes et recommandations par priorité.

## P0 — Bloquant

Exemples :

```text
- skills désactivés encore utilisés ;
- permissions non appliquées ;
- tous les skills injectés dans tous les prompts ;
- router incapable de ne sélectionner aucun skill ;
- erreurs silencieuses de manifest.
```

## P1 — Important

Exemples :

```text
- descriptions trop vagues ;
- logs insuffisants ;
- pas de tests de routing ;
- provider adapter incomplet ;
- references trop souvent chargées.
```

## P2 — Amélioration

Exemples :

```text
- meilleure UI ;
- scores de santé ;
- métriques qualité ;
- recent runs ;
- eval queries par skill.
```

## P3 — Plus tard

Exemples :

```text
- marketplace ;
- plugins ;
- analytics avancées ;
- comparaison graphique multi-provider ;
- gestion avancée des versions.
```

---

# 16. Format de verdict final

Codex doit terminer son audit avec un verdict clair.

Format attendu :

```markdown
## Verdict final

### Est-ce que l’architecture fonctionne ?
Oui / Non / Partiellement

### Est-ce qu’elle améliore la qualité ?
Oui / Non / Partiellement

### Points forts

### Points faibles

### Risques principaux

### Actions prioritaires avant de considérer la migration terminée

### Actions secondaires
```

Le verdict doit être honnête. Si l’architecture est propre mais ne produit pas encore de gain qualité mesurable, Codex doit le dire.

---

# 17. Principe final

L’objectif n’est pas d’avoir une belle architecture abstraite.

L’objectif est que les skills :

```text
- soient découverts correctement ;
- se déclenchent au bon moment ;
- ne se déclenchent pas au mauvais moment ;
- chargent seulement ce qui est utile ;
- améliorent réellement la réponse ;
- fonctionnent avec plusieurs providers ;
- soient observables et testables.
```

Phrase clé :

```text
Un runtime de skills réussi ne se mesure pas au nombre de composants,
mais à sa capacité à produire de meilleures réponses de manière explicable.
```