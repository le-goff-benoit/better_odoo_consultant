# Audit de fonctionnement du runtime de Skills IA

Date : 2026-05-24

## 1. Résumé exécutif

L’architecture skills fonctionne dans son état actuel : les 28 skills du catalogue `skills/` sont découverts, parsés, exposés à l’UI, routés dans le contexte IA et utilisables par les meta-tools / handlers backend. Les tests existants confirment le chargement sécurisé des références, l’application des permissions déclaratives sur les meta-tools, la construction des toolsets multi-provider et l’émission d’événements runtime.

Le gain qualité est réel mais encore partiellement maîtrisé : le routing sélectionne correctement les skills importants sur les cas typiques, sait ne rien sélectionner sur un prompt hors sujet, et charge les références/templates de manière bornée. En revanche, plusieurs prompts déclenchent trop de skills voisins, certains skills transverses comme `output_report_writer` sont trop facilement sélectionnés, et l’observabilité ne suffit pas encore à expliquer complètement une exécution après coup.

Résultat des validations exécutées pendant l’audit :

- Audit catalogue : 28 dossiers, 28 `SKILL.md`, 28 skills chargés, 0 doublon observé, 9 core + 19 tool.
- Ressources catalogue : 14 références, 12 références auto-load, 25 exemples, 5 templates, 26 scripts.
- Tests ciblés runtime skills/contexte/providers : `99 passed in 0.47s`.
- Tests backend complets déjà validés après le renommage `skills/` : `282 passed, 1 warning`.

Limite méthodologique : cet audit vérifie le runtime, le contexte assemblé, les toolsets, les événements et les tests. Il ne mesure pas encore une qualité LLM réelle avec appels OpenAI/Claude/Gemini, faute de benchmark connecté aux providers et de scoring humain/automatique des réponses finales.

## 2. Architecture réellement observée

| Composant attendu | Équivalent réel | État observé |
|---|---|---|
| SkillRegistry | `backend/skills/registry.py` | Charge `skills/*/SKILL.md`, ordre stable core puis alpha. |
| ManifestParser | `backend/skills/manifest.py` | Parse frontmatter YAML, valide name/description/body, merge `x-app`. |
| SkillRouter | `backend/services/context_service.py::_select_skill_playbooks` | Heuristique : nom explicite, keywords, bundles d’intention, patterns. |
| SkillLoader | `backend/services/skill_loader.py` | Charge références/templates/examples/scripts avec anti-traversal. |
| ExecutionEngine / ScriptExecutor | `backend/services/execution_engine.py` | Exécute meta-tools, handlers in-process et scripts subprocess. |
| PolicyEngine | `backend/services/policy_engine.py` | Enforce filesystem/scripts sur meta-tools ; handler autorisé via toolset. |
| ContextManager | `backend/services/context_service.py` | Assemble contexte routé avec budget et priority blocks. |
| OutputRenderer | `backend/services/output_renderer.py` | Sélectionne un template de sortie par triggers. |
| Logger | `backend/services/skill_runtime.py` + logs Python | Événements runtime structurés partiels. |
| ProviderAdapter | `backend/services/provider_adapters.py` | Adapters Claude/OpenAI/Gemini/GitHub/Copilot en backend-emulated. |

Points de conformité : le backend est bien le runtime, les providers sont interchangeables au niveau tool format, et les skills ne dépendent pas d’un provider natif.

Écarts principaux : pas de scopes `project/user/organization`, pas de `agents/openai.yaml`, pas de `allow_implicit_invocation`, pas de gestion explicite des doublons, pas de run_id persistant ni trace complète des fichiers chargés dans l’UI.

## 3. Audit de découverte des skills

État observé :

- Stockage : `skills/<slug>/`.
- Découverte : uniquement les dossiers directs contenant `SKILL.md`.
- Ordre : core via `_CORE_ORDER`, puis les autres dossiers alphabétiquement.
- Chargement actuel : 28/28 skills découverts et chargés.
- Dossiers sans manifest : aucun dans l’état actuel.
- Doublons observés : aucun doublon de name, alias ou dossier chargé.

Conclusion : la découverte est fiable pour le catalogue applicatif actuel.

Limites :

- Si deux manifests déclarent le même `name`, le loader ne bloque pas explicitement le doublon ; `skill_by_name()` retournera le premier match et l’UI peut exposer deux entrées ambiguës.
- Les skills invalides sont seulement loggés côté backend et ignorés ; l’UI ne montre pas un état “invalid manifest”.
- Aucun scope externe (`.agents/skills`, project, user, organization) n’est supporté aujourd’hui.
- Le statut “LOCKED” dans l’UI est dérivé de `builtin`, mais le modèle de permission ne contient pas de champ `locked` explicite.

## 4. Audit du parsing des manifests

État observé :

- `name`, `description` et body Markdown sont obligatoires.
- Les permissions sont normalisées avec defaults sûrs.
- `version`, `author`, `tags`, `templates`, `references_auto_load`, `aliases`, `code_path`, `modes`, `group`, `kind`, `builtin`, `read_only` sont supportés.
- Les 28 skills sont à `version: 1.0.0` et ont un auteur.
- Tous les tools ont un `code_path`.
- Tous les skills ont un diagramme.

Limites :

- Le champ `outputs` est autorisé par `x-app` mais n’est pas exploité par le registry.
- Pas de validation de `code_path` contre le fichier réel.
- Pas de validation stricte de `group`, `kind`, `risk_level`, `modes` au parsing ; ils sont coercés plus tard.
- Pas de support `agents/openai.yaml` / `agents/anthropic.yaml`.
- Le format est compatible avec le runtime interne, mais pas encore avec un format Agent Skills portable complet.

## 5. Audit du routage implicite et explicite

Le routing est actuellement déterministe et explicable :

- match explicite par nom runtime dans le prompt : score 100 ;
- match par `keywords` : score 60 ;
- bundles d’intention : score 40 ;
- patterns forts : SHA, navigation, KPI, sécurité ;
- mode-level defaults pour migration et Creator ;
- candidats exposés via `last_skill_route_candidates()` et événement SSE `skills_selected`.

Matrice de routing échantillonnée :

| Prompt / cas | Attendu | Observé | Verdict |
|---|---|---|---|
| `Quel temps fait-il aujourd’hui ?` | Aucun skill tool | Aucun skill tool | OK |
| Rapport QWeb + xpath | `odoo_inspect_report` | `odoo_inspect_report`, `odoo_inspect_view`, `output_report_writer` | OK mais trop large |
| Vue XML attrs/states | `odoo_inspect_view` | `odoo_inspect_view`, `odoo_inspect_navigation`, `odoo_inspect_security` | OK mais trop large |
| ACL / record rules | `odoo_inspect_security` | Security + query/fields/count/navigation + template audit | OK mais trop large |
| Email de suivi client Odoo | Aucun skill technique | `output_report_writer` | Faux positif |
| Manifest repo custom | `repo_read_file`, `repo_list_modules` | Repo skills + modules/source + output writer | OK mais trop large |
| KPI CA par commercial/mois | `odoo_aggregate_records` | Aggregate + count | OK |
| SHA commit migration | `source_show_commit` | Commit + plusieurs skills migration/live | OK mais trop large |
| Revue technique livrable | `output_report_writer` + template | Template correct + nombreux skills voisins | OK mais trop large |
| Security désactivé | Security absent | Security absent, autres skills restent | OK pour disabled |

Conclusion : le routeur sait sélectionner les bons skills top-level, sait ne sélectionner aucun skill sur un prompt évident, et respecte les disabled tools. Le problème principal est la sur-sélection par bundles/keywords, qui augmente le contexte et peut brouiller la réponse.

Champs non supportés aujourd’hui : routing par description sémantique, tags, embeddings, LLM classifier, score de confiance normalisé, `allow_implicit_invocation=false`.

## 6. Audit du progressive loading

Points positifs :

- Les références ne sont pas toutes injectées par défaut.
- Les exemples sont limités : top 3, budget 4000 caractères.
- Les auto-load refs sont limitées à 2 fichiers, 4500 caractères par fichier, puis cap priority block à 6000 caractères.
- Les templates de sortie ne sont injectés que si un trigger matche.
- Le contexte final est borné par `_CONTEXT_BUDGET_CHARS`.

Limites importantes :

- Le registry charge en mémoire le body complet de tous les `SKILL.md` au démarrage. Ce n’est pas une injection prompt, mais ce n’est pas un lazy load strict niveau disque.
- Dès qu’un skill est sélectionné, tout son body est injecté, enrichi avec la liste des références et scripts disponibles.
- La sur-sélection de skills transforme vite un prompt simple en contexte volumineux : plusieurs scénarios dépassent 20k caractères.
- L’audit a observé un warning réel : `Priority context block truncated: 9198 chars > 6000` sur un prompt QWeb avec deux références auto-loadées. Cela signifie que le progressive loading existe, mais que certaines combinaisons référentielles restent trop lourdes.
- Les fichiers chargés ne sont pas exposés comme une liste structurée durable ; ils sont visibles dans le contexte/logs, mais pas comme artefact d’audit complet.

Conclusion : progressive loading partiellement respecté. Il évite l’injection globale de toutes les références, mais la granularité reste trop grossière côté playbooks et certaines auto-load refs dépassent le budget.

## 7. Audit de l’exécution multi-LLM

Providers observés :

| Provider | Tool format | Mode | Native skills | Structured output |
|---|---|---|---|---|
| Claude | claude | backend_emulated | non | non |
| OpenAI | openai | backend_emulated | non | oui |
| Gemini | gemini | backend_emulated | non | oui |
| GitHub Models | openai | backend_emulated | non | oui |
| Copilot | openai | backend_emulated | non | oui |

Conclusion : le runtime est provider-agnostic dans son architecture backend-emulated. Le choix du provider intervient après assembly du contexte et sélection du toolset adapté.

Limites :

- Pas de mode natif provider réellement activé.
- Pas de benchmark comparatif réel multi-provider.
- Les capacités `max_context_tokens`, filesystem/code execution natives, MCP restent déclaratives ou non renseignées.

## 8. Audit des permissions et scripts

Points positifs :

- `SkillLoader` refuse traversal, sous-dossiers non autorisés et extensions incorrectes.
- `PolicyEngine` refuse `run_skill_script` si `permissions.scripts=false`.
- Les scripts subprocess ont timeout 30s, stdout cap 32k, stderr cap 4k.
- Si `unshare` est disponible et `network=false`, le subprocess est lancé sans réseau.
- Les événements runtime loggent policy decisions, reference_loaded et script_executed.

Limites / risques :

- `run_handler` est toujours autorisé par policy si le tool est exposé ; les permissions `filesystem/network/odoo` ne sont pas réellement enforce sur les handlers in-process.
- L’isolation réseau dépend de `unshare` ; si absent, `network=false` n’empêche pas techniquement un script Python d’ouvrir du réseau.
- Le sandbox filesystem des scripts est limité : cwd dans le skill, env réduit, mais pas de chroot/seccomp.
- Les symlinks dans `references/templates/examples/scripts` sont résolus et doivent rester sous le sous-dossier cible ; c’est correctement protégé par `relative_to(base.resolve())`.
- Les accès Odoo des handlers sont contrôlés surtout par disponibilité de `ctx.odoo` et toolset, pas par une policy centrale détaillée par action.

Conclusion : permissions réellement appliquées pour meta-tools et loader, partiellement appliquées pour handlers/scripts au sens sandbox strict.

## 9. Audit de l’observabilité

Disponible aujourd’hui :

- événement SSE `skills_selected` avec skills et candidats scorés ;
- événements runtime provider_called, policy_decision, reference_loaded, script_executed, execution_done ;
- debug log d’assemblage contexte avec taille totale, budget, priority blocks, sections ;
- UI : panneau contexte avec skills utilisés ; page Skills avec détails, `SKILL.md`, références/templates/examples, permissions, providers, historique local.

Manques critiques :

- pas de `run_id` corrélé de bout en bout ;
- pas de trace persistée des fichiers chargés, références tronquées, scripts exécutés et stdout/stderr par conversation ;
- pas d’affichage UI des candidats non sélectionnés, scores et raisons ;
- pas d’explication “pourquoi aucun skill” ;
- pas d’accès UI au contexte final complet envoyé au provider ;
- pas de coût/tokens par skill/reference/template ;
- observabilité dépendante des logs runtime et des events en mémoire/SSE, difficile à exploiter après coup.

Conclusion : observabilité suffisante pour tests et debugging développeur, insuffisante pour améliorer le routing en continu en conditions réelles.

## 10. Audit qualité : avec skills vs sans skills

Constat mesurable côté runtime :

- Les prompts techniques reçoivent bien des playbooks spécialisés et parfois des références ciblées.
- Les templates structurés sont injectés pour les livrables.
- Les prompts hors sujet n’injectent aucun skill tool.
- Les disabled tools sont respectés.

Constat non encore mesuré :

- Il n’existe pas de benchmark “réponse sans skills vs réponse avec skills” automatisé.
- Il n’existe pas de score qualité humain/LLM judge ni de snapshots de réponses multi-provider.
- L’impact final réel sur hallucinations, structure et précision reste donc partiellement inféré depuis le contexte, pas prouvé sur réponses finales.

Verdict qualité : amélioration probable et partielle. L’architecture apporte de meilleures instructions au modèle dans les cas techniques, mais il faut un benchmark de réponses pour affirmer une amélioration nette et stable.

## 11. Bugs ou incohérences détectés

1. `output_report_writer` se déclenche sur un prompt “email de suivi client Odoo” sans sélectionner de template email. C’est un faux positif utile à corriger.
2. Les bundles d’intention sont parfois trop larges : une vue XML déclenche aussi navigation/sécurité ; un SHA migration déclenche de nombreux skills live/migration.
3. Les références auto-load QWeb + view peuvent dépasser le priority block et être tronquées avant usage complet.
4. Les doublons de `name` ne sont pas bloqués explicitement par le registry.
5. Les invalid manifests sont ignorés avec warning log, mais pas exposés dans le catalog/UI.
6. `builtin` est affiché comme `LOCKED`, mais il n’y a pas de règle backend stricte “locked cannot be disabled”.
7. Les champs manifest `tags` et descriptions ne pilotent pas réellement un router sémantique ; les `keywords` dominent.
8. `outputs` est listé comme extension possible mais non exploité.
9. Les permissions réseau/FS des handlers in-process ne sont pas sandboxées au même niveau que le loader.

## 12. Risques actuels

- Sur-sélection → contexte trop long, instructions contradictoires, baisse de précision.
- Observabilité insuffisante → difficile de corriger les faux positifs/faux négatifs en production.
- Policy partielle sur handlers → risque de confusion entre permission déclarée et sécurité effective.
- Absence de tests near-miss par skill → régressions de routing probables lors de l’ajout de keywords.
- Absence de gestion de doublons/scopes → risque futur si des skills projet/user sont ajoutés.

## 13. Recommandations prioritaires

### P0 — À corriger avant de considérer la migration terminée

1. Ajouter une validation registry bloquante ou explicitement reportée pour les doublons de `name` et d’alias.
2. Ajouter un audit manifest exposable : invalid skills, warnings, fichiers manquants, `code_path` non résolu.
3. Réduire la sur-sélection du router : seuil minimal, cap par famille, raisons “selected=false” pour candidats non retenus.
4. Corriger `output_report_writer` pour ne pas être injecté comme playbook générique ; le réserver aux templates déclenchés ou à des triggers livrable stricts.
5. Ajouter une trace structurée des fichiers chargés et références tronquées dans les runtime events.

### P1 — Important

1. Ajouter une matrice de routing par skill : positifs, négatifs, near misses, FR/EN.
2. Ajouter `allow_implicit_invocation` au manifest et l’enforcer dans `_select_skill_playbooks`.
3. Ajouter un champ `locked` distinct de `builtin`, enforce backend côté config tools.
4. Découper les références auto-load lourdes ou les résumer pour éviter les truncations priority block.
5. Ajouter run_id/session_id aux runtime events, tool calls et `skills_selected`.
6. Persister un résumé d’exécution consultable depuis l’UI Skills : candidats, sélection, références, scripts, durée, erreurs.

### P2 — Amélioration

1. Exploiter `tags` et `description` dans un scoring normalisé, ou ajouter un mini-classifier déterministe/LLM optionnel.
2. Ajouter un benchmark qualité “avec/sans skills” sur 20 prompts représentatifs.
3. Afficher dans l’UI les candidats non sélectionnés et raisons de non-sélection.
4. Renseigner `max_context_tokens` et capacités provider plus finement.
5. Ajouter support expérimental de scopes project/user/org après durcissement des doublons.

## 14. Tests à ajouter

Tests P0 recommandés :

- `test_registry_rejects_duplicate_skill_names`
- `test_registry_reports_duplicate_aliases`
- `test_registry_reports_invalid_manifest_to_catalog`
- `test_code_path_must_resolve_inside_skill_folder`
- `test_output_report_writer_not_selected_for_plain_client_email_without_template_trigger`
- `test_router_caps_selected_skills_for_single_intent_prompt`
- `test_auto_loaded_reference_truncation_is_emitted_as_runtime_event`
- `test_builtin_or_locked_skill_cannot_be_disabled_without_explicit_override`

Tests P1 recommandés :

- matrice JSON de routing par skill avec 8 positifs / 8 near-misses ;
- test `allow_implicit_invocation=false` ;
- test “aucun skill pertinent” avec absence de références/templates ;
- test prompt QWeb charge uniquement références QWeb/view nécessaires ;
- test prompt sécurité ne charge pas QWeb ;
- test multi-provider toolset sur même prompt et même sélection ;
- test runtime events contiennent run_id, provider, model, candidats, fichiers chargés.

## 15. Verdict final

### Est-ce que l’architecture fonctionne ?

Oui. Le runtime backend découvre, parse, route, charge et exécute les skills avec tests automatisés passants.

### Est-ce qu’elle améliore la qualité ?

Partiellement. Elle améliore clairement le contexte disponible pour les prompts techniques et structurés, mais la qualité finale n’est pas encore prouvée par un benchmark comparatif et le routing trop large peut parfois dégrader le signal.

### Points forts

- Catalogue `skills/` propre : 28 skills chargés, metadata cohérente, 0 doublon observé.
- Runtime provider-agnostic en backend-emulated.
- Progressive loading existant pour références/examples/templates.
- Permissions meta-tools réellement testées.
- Événements runtime et SSE déjà présents.
- UI Skills nettement plus explicative qu’une simple liste de toggles.

### Points faibles

- Router heuristique trop permissif.
- Pas de validation registry forte sur doublons/scopes/invalid manifests visibles.
- Observabilité non persistée et incomplète.
- Permissions handlers/scripts pas équivalentes à un vrai sandbox.
- Pas de benchmark qualité avec/sans skills.

### Risques principaux

- Contexte trop volumineux et moins focalisé.
- Faux positifs difficiles à diagnostiquer sans logs persistés.
- Confusion entre permissions déclarées et garanties de sécurité effectives.
- Ajout futur de skills/scopes plus risqué sans validation stricte.

### Actions prioritaires avant de considérer la migration terminée

1. Durcir registry/manifest : doublons, code_path, invalid manifests reportés.
2. Resserrer le router et corriger `output_report_writer`.
3. Ajouter events structurés pour fichiers chargés/truncations/scripts.
4. Créer une matrice de routing et l’intégrer aux tests.
5. Mettre en place un benchmark qualité minimal avec/sans skills.

### Actions secondaires

- Ajouter scopes project/user/org.
- Ajouter `allow_implicit_invocation` et `locked`.
- Améliorer UI recent runs et candidats scorés.
- Évaluer un routing hybride description/tags/LLM classifier après stabilisation du routeur déterministe.
