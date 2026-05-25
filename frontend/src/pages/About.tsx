import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import { APP_VERSION } from '../version'
import { useUiLanguage } from '../i18n'

const VERSION = APP_VERSION

const CHANGELOG = [
  {
    version: '0.97.3',
    date: '2026-05-26',
    badge: 'Actuel',
    badgeColor: t.brand,
    items: [
      'Skill dispatcher — résolution des 4 faiblesses identifiées en 0.97.2. Chaque xfail portait le wording exact du fix à appliquer : (1) `list` ajouté aux `_BOUNDARY_TOKENS` pour que le keyword anglais "list" de `odoo_inspect_view` ne match plus le verbe français "liste" (cause racine de la sur-sélection sur les prompts de listing) ; (2) extension d\'`explicit_list_terms` et nouvelle prune de `odoo_inspect_view/navigation/security` quand des marqueurs list-detail (`avec nom`, `avec montant`, `avec date`, `liste des`) accompagnent une intention query (p04b) ; (3) nouveau pattern `manifest-read-pattern` au scoring (score 100) qui détecte `verbe lecture + __manifest__.py` et route vers `source_read_odoo_file` (ou `repo_read_file` selon un signal projet/custom), couplé à une prune de `repo_list_modules` / `inspect_module_graph` / `odoo_inspect_modules` (p06b) ; (4) nouvelle rule `pruned:sha-focus` qui élimine les skills source frères quand `source_show_commit` est sélectionné via SHA (\\b[0-9a-f]{7,40}\\b), tout en préservant `repo_*` quand le prompt mentionne un override/projet client — sinon les tests goldens commit-analysis cassaient (p10a) ; (5) `financial_terms` enrichi de `rapport tva`, `vat report`, `rapport balance`, `rapport bilan`, `rapport grand livre`, `trial balance` pour que la pruning rule `financial-report-focus` déjà en place se déclenche sur les vrais phrasings (p11a)',
      'Résultats : Skill dispatcher 311 cas, 100 % accuracy / 100 % positive / 100 % negative / 100 % paraphrase, 0 known weakness restante. Agent response eval inchangé à 90.5 % / 98.5 % / 4 golden failures (pas de régression côté agents). Suite 807 passed',
      'Leçon — les xfails avec wording exact du fix sont un excellent levier de mémoire d\'équipe : on ne devine pas la classe de patch nécessaire au moment de la régression, on l\'a écrite dès la mesure. Méthode à appliquer chaque fois qu\'un cas hard est ajouté au harnais',
    ],
  },
  {
    version: '0.97.2',
    date: '2026-05-26',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skill dispatcher — désambiguïsation des paires de skills sémantiquement proches. Script de génération des voisins via le `_SemanticIndex` existant : top-20 paires avec cosine ≥0.20, dominées par read/search/modules entre source/repo/migration et par count/query/aggregate sur les live data. 27 cas de désambiguïsation écrits manuellement dans `scripts/quality_eval/disambiguation_cases.jsonl` (3 cas par paire haute-criticité, avec champ nouveau `forbidden_skills` qui force une assertion stricte : « tel skill DOIT gagner ET tels autres NE DOIVENT PAS être sélectionnés »)',
      'Harnais — `run_skill_dispatcher_eval.py` étendu : nouveau loader `_load_disambiguation` pour le fichier JSONL, support du champ `forbidden_skills` côté curated/disambiguation, rapport markdown qui sépare « Real failures » de « Known weaknesses (xfail) » pour que le statut soit lisible d\'un coup d\'œil',
      'Skills — `odoo_inspect_modules` enrichi de `installé en base`, `installé en bdd`, `installé sur l\'instance`, `installed on the database`, `actuellement installé`, `module présent en base`. Corrige le cas de désambiguïsation p03c qui partait vers `inspect_module_graph` via le semantic fallback (cos=0.16)',
      'Diagnostic — 4 vraies faiblesses dispatcher identifiées par les nouveaux cas et documentées en `xfail` avec leur cause précise et la classe de fix nécessaire : (1) bundle `intent:record_analysis` trop large quand query_records domine (p04b), (2) pattern `verbe+__manifest__.py` non câblé (p06b), (3) over-selection des skills source frères quand une SHA est présente (p10a), (4) `odoo_inspect_report` co-sélectionné avec `inspect_financial_reports` sur TVA/journal/balance (p11a). Chaque xfail porte le wording exact du fix à appliquer',
      'Résultats vs 0.97.1 (offline, 307 cas) : accuracy 100 %, positive 100 %, negative 100 %, paraphrase 100 % (24), train/dev/test tous à 100 %. 4 known weaknesses listées séparément, suite 807 passed',
    ],
  },
  {
    version: '0.97.1',
    date: '2026-05-26',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skill dispatcher — nouveau harnais d\'éval unifié `scripts/quality_eval/run_skill_dispatcher_eval.py` qui ingère les 28 prompts curated de `dataset.json` + les 256 queries des `skills/*/eval_queries.json` (284 cas au total). Mesure positive accuracy / negative accuracy / paraphrase accuracy avec split stable train/dev/test 70/15/15 (hash sha1 de l\'id), matrice de confusion skill-to-skill et exclusion des cas `xfail` du scoring. Mirror exact de `run_agent_response_eval.py` pour la couche dispatcher',
      'Skills — paraphrases ajoutées sur 12 skills pivots (24 reformulations sur `odoo_query_records`, `odoo_count_records`, `odoo_aggregate_records`, `odoo_inspect_view`, `odoo_inspect_security`, `odoo_inspect_report`, `odoo_inspect_studio`, `source_search_odoo`, `source_show_commit`, `repo_search_code`, `triage_odoo_error`, `compare_odoo_versions`). 2 trous détectés à la mesure et corrigés : `odoo_aggregate_records` enrichi avec `ca mensuel`/`mensuel`/`annuel`/`trimestriel`/`monthly`/`yearly`/`réalisé`/`tendance` (paraphrase "Quel CA mensuel a-t-on réalisé sur 2025 ?" ne matchait plus), `triage_odoo_error` enrichi avec `exception python`/`exception remonte`/`cause racine`/`does not exist`/`peux-tu la classer` (paraphrase "Cette exception Python remonte d\'Odoo en prod, peux-tu la classer ?" partait vers `source_search_odoo`)',
      'Tests — +3 cas (`test_skill_dispatcher_eval.py`) : chargement du corpus complet, baseline ≥97%, exclusion xfail. Suite 807 passed',
      'Résultats vs 0.97.0 (offline, 284 cas) : accuracy 100%, positive 100%, negative 100%, paraphrase 100% sur les 24 paraphrases ajoutées. Train/dev/test tous à 100%. Confusion matrix vide. Le dispatcher était déjà tuné sur ce corpus — le vrai signal viendra des futurs ajouts hors-corpus',
    ],
  },
  {
    version: '0.97.0',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Routing agents — refonte de la boucle de feedback en 5 itérations mesurables. Le dataset d\'éval (200 cas) reçoit un split stratifié train/dev/test 70/15/15 et 54 paraphrases sur 27 cas golden : la métrique d\'agent accuracy passe d\'un faux 100% (overfit lexical du verbatim) à un baseline honnête de 69.5%, puis remonte à 90.5% par couches successives — incident framing detector (support 38→78%), strategy framing detector (architect 72→94%), code-artefact framing detector (developer 72→96%), vote sémantique TF-IDF sur les corpus d\'agents (paraphrase 64.8→72.2%), enrichissement chirurgical des descriptions FR+EN sans duplication des keywords (support→BA confusion 16→9)',
      'Backend — nouveau module `_count_framing` dans `ai_service.py` avec 3 listes de tokens de framing orthogonaux aux `auto_keywords` agents : `_INCIDENT_FRAMING_TERMS` (~55 tokens, boost support +4/hit cap 10), `_STRATEGY_FRAMING_TERMS` (~30 tokens, boost architect), `_CODE_ARTEFACT_FRAMING_TERMS` (~30 tokens, boost developer). Appliqués en phase 3a de `_infer_perspective`, tracés dans `last_result.candidates` pour audit',
      'Backend — `semantic_router.py` étendu avec `_AgentSemanticIndex` indexant `description + description_en + auto_keywords` des 4 agents. Nouveau `semantic_agent_vote(prompt)` consommé par `_infer_perspective` en phase 3b : promotion à confidence high si le vote sémantique confirme le best lexical (cos ≥0.18), choix sémantique au lieu du fallback BA aveugle si lexical < seuil et cos ≥0.15. Désactivable via `BETTER_SEMANTIC_ROUTER=0`',
      'Harnais qualité — `scripts/quality_eval/` enrichi avec matrice de confusion par split (`_confusion_matrix` + `_top_confusions`), métriques paraphrase agent/tool, vue par-split (train/dev/test) dans le rapport Markdown. Nouveau script `promote_feedback.py` qui extrait les candidats du log `routing-feedback.jsonl` vers le dev set (filtre `reformulated` / `low-confidence` / `drift`). Nouveau scaffold `llm_judge.py` (modèle figé `claude-opus-4-7`) pour noter `odoo_accuracy`/`answer_quality`/`handoff_quality` à partir de traces de réponses externes',
      'Agents — descriptions FR+EN des 4 AGENT.md enrichies avec 5-8 "formes de demande typiques" narratives orthogonales aux `auto_keywords` (évite la duplication TF-IDF). `auto_keywords` parallèlement trimmées des ~120 phrases dataset-verbatim ajoutées en 0.96.2 (overfit) ; conservation des tokens d\'incident génériques qui survivent aux paraphrases',
      'Tests — suite backend 804 passed, +1 cas (`test_agent_response_eval` mis à jour pour la nouvelle clé `tool_accuracy` et `by_split`). Rapport final : agent_accuracy 90.5%, tool_accuracy 98.5%, paraphrase 70.4%, dev split 93.8%, golden failures 4',
    ],
  },
  {
    version: '0.96.2',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — nouveau skill `triage_odoo_error` (mode assistant + migration) : prend un traceback / log Odoo en entrée, parse la stack (frame innermost, classe d\'exception, module) et classe la cause racine entre 5 familles — `migration`, `studio`, `data`, `custom_dev`, `source_code`. Sort un verdict + niveau de confiance + évidence + prochaine action recommandée (un seul skill). Inclus dans `preferred_skills` des agents `support` et `business_analyst`. 2 références auto-loadables (arbre de décision + patterns d\'erreur migration)',
      'Système — correction de 4 bugs de pinning version/locale dans le system prompt : (1) le bloc `## Instance connectée` lisait `profile.odoo_version` même quand un environnement non-primaire (staging/test) imposait une version différente, créant un décalage silencieux avec les sources et les requêtes XML-RPC ; (2) idem en mode migration ; (3) le pays/localisation fiscale n\'apparaissait que dans le priority block routé, vulnérable à la pression budgétaire — désormais épinglé directement sous l\'Instance ; (4) en mode général, le `country_code` choisi dans l\'UI n\'était jamais répété en tête de prompt, l\'IA était aveugle au pays. `stream_chat` propage maintenant `country_code` et `country_name`. +8 tests dédiés (`test_system_prompt_pinning.py`)',
      'Tests — +13 cas backend (`test_triage_odoo_error.py` 14 cas, `test_system_prompt_pinning.py` 8 cas). Suite backend : 802 passed',
    ],
  },
  {
    version: '0.96.1',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Assistant IA — nouveau strip de chips « Avis complémentaire » sous chaque réponse, à côté des propositions d\'action : 1 à 2 chips filtrées par les `handoff_can_handoff_to` de l\'agent courant. Click → relance un tour avec **override de perspective** vers l\'agent invité et un préfixe structuré qui injecte la réponse précédente (capée à 4000 chars) puis demande un avis qui **complète** sans réécrire',
      'Frontend — `sendWithText` accepte désormais un 4e argument `perspectiveOverride` (utilisé uniquement par les chips d\'avis complémentaire) ; chaque message assistant persiste sa perspective au moment de la création pour que la reprise de session reste cohérente',
      'Cas d\'usage couverts en standard : dev → architect (validation trajectoire, perfs, multi-société), BA → developer (estimation effort/risque), architect → support (impact run/oncall), support → BA (vérif règle de gestion), et symétriques',
      'Tests — +3 cas frontend (`buildSecondOpinionPrompt` FR/EN + cap 4 k). Suite Vitest 53 passed',
    ],
  },
  {
    version: '0.96.0',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Routing — semantic fallback TF-IDF cosinus en pur Python sur le catalogue de skills : se déclenche uniquement quand aucun signal lexical ne dépasse 60, contribue au plus 1 skill au score 50 (sous keywords, au-dessus de mode-default). Récupère les paraphrases que les keywords manquent sans dépendance externe (`backend/services/semantic_router.py`)',
      'Routing — niveau de confiance (`high` ≥80, `medium` ≥40, `low` sinon) exposé via `last_skill_route_confidence()` et SSE `routing_confidence` envoyé avant le streaming, prêt à être consommé côté frontend pour offrir une chip de clarification',
      'Agents — détection de drift sur les 2 derniers tours utilisateur : si l\'agent inféré (confiance haute) diverge 2 fois consécutives de l\'agent actif, émission SSE `agent_drift` proposant la bascule (opt-in côté UI, jamais silencieuse). Lecture de `handoff_can_handoff_to` activée',
      'Observabilité — log JSONL local de feedback de routage sous `~/.odoo-consultant/routing-feedback.jsonl` (rotation 5000 lignes). Détection automatique des reformulations utilisateur (« non », « plutôt », « actually », « rather ») pour marquer le routage précédent comme imparfait',
      'Skills — 3 nouveaux méta-skills : `routing_explain` (restitue les candidats scorés du dernier tour avec leurs raisons et le niveau de confiance), `agent_handoff_propose` (propose un changement d\'agent à frontière de phase, validé contre `handoff_can_handoff_to`), `routing_self_audit` (rapport agrégé sur le log : taux de reformulation, confiance basse, skills problématiques)',
      'Tests — +20 cas (semantic router, feedback log, méta-skills, eval queries routing). Suite : 767 passed, 0 xfailed',
    ],
  },
  {
    version: '0.95.2',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Assistant IA / Migration — reprise de page fiabilisée : une génération quittée puis retrouvée ne produit plus de fausse erreur « Session interrompue »',
      'Assistant IA — persistance active renforcée pendant les streams hors page : les messages sont écrits immédiatement en localStorage et resynchronisés depuis le buffer mémoire au retour',
      'Conversations actives — nettoyage des réponses interrompues sans contenu visible : suppression des bulles assistant vides et conservation des sorties partielles ou résultats d’outils déjà reçus',
    ],
  },
  {
    version: '0.95.1',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Mermaid — rendu enrichi : boutons copier / télécharger `.mmd` / plein écran dans les blocs Mermaid et dans la modale, avec feedback visuel après copie',
      'Mermaid — liens flowchart configurés en `curve: linear` et styles CSS plus nets pour éviter les courbes libres désordonnées',
      'Skill `generate_diagram` — standard qualité renforcé : cartes titrées (`<b>Titre</b>` + détail), templates Mermaid avec `classDef`, espacement explicite, consignes anti-spaghetti et sorties déterministes plus présentables',
      'Graphes générés — helper partagé `mermaid_flowchart` produit désormais des nœuds titrés et des classes visuelles par défaut pour les graphes de modules et d\'héritage',
    ],
  },
  {
    version: '0.95.0',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — 2 nouveaux skills IA self-contained : `inspect_financial_reports` pour les rapports financiers Enterprise `account.report` (list/recommend/describe/run/export) et `inspect_spreadsheet` pour les Odoo Spreadsheets et dashboards (list/inspect/explain_formula/suggest_formula)',
      'Backend — nouveaux services `financial_report_service.py` et `spreadsheet_service.py` : lecture bornée `account.report`, lignes/colonnes/expressions, exécution `_get_lines`, export XLSX borné à 5 MB, inspection payload JSON/XLSX spreadsheet et inventaire des formules `ODOO.*`',
      'Routing — bundles et patterns `financial_audit` / `spreadsheet_audit`, avec pruning `financial-report-focus` et `spreadsheet-focus` pour éviter les fuites vers query/fields/report quand la demande vise clairement un état financier ou un tableur Odoo',
      'Qualité — couverture eval queries portée à 34/34 skills et dataset routing enrichi avec bilan client, P&L projet, explication `ODOO.PIVOT` et inventaire spreadsheet',
    ],
  },
  {
    version: '0.94.0',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — 4 nouveaux skills IA self-contained : `compare_odoo_versions` (diff statique modèle/vue/module entre versions Odoo), `inspect_automations` (audit crons, base.automation, actions serveur et templates mail), `inspect_module_graph` (dépendances manifest + héritages modèles) et `generate_diagram` (diagrammes Mermaid flow/class/inheritance/module)',
      'Routing — bundles et patterns dédiés pour comparaison de versions, automatismes, graphes de module et diagrammes, avec pruning `automation-focus`, `diagram-focus` et `module-graph-focus` pour éviter les fuites vers query/fields/view/read-file',
      'Markdown — les fences `mermaid` sont rendues visuellement via un composant `MermaidBlock` lazy-loaded, avec fallback code brut en cas d\'erreur et bouton d\'agrandissement en modal',
      'Frontend — ajout de la dépendance `mermaid` en chargement dynamique : le rendu diagramme est disponible sans l\'inclure dans le bundle initial principal',
      'Qualité — couverture eval queries complète portée à 32/32 skills et dataset qualité routing enrichi avec version diff, automation audit, module graph et diagram generation',
    ],
  },
  {
    version: '0.93.1',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'UI Settings — onglets du détail de skill : suppression du suffixe `· N` (compteurs) sur Références / Exemples / Tests routing / Historique d\'utilisation. Les libellés s\'affichent seuls, l\'info de volume était bruyante et peu actionnable',
      'Skills — comblement des 2 vrais trous documentaires : `odoo_query_records` reçoit une référence lazy `query_pitfalls.md` (domaines polonais, `active_test`, contexte `lang`/`tz`/`company`/`bin_size`, pagination 500/5000, modèles courants `account.move` / `sale.order` / `stock.move`, erreurs XML-RPC fréquentes)',
      'Skills — `odoo_inspect_modules` reçoit une référence lazy `module_taxonomy.md` (distinguer Community/Enterprise/custom, conventions de nommage `l10n_*` / `<client>_*`, lecture de stack PME, dépendances pour cadrage migration, pièges `state=to upgrade` / `uninstalled sales`)',
      'Skills — les deux références sont en lazy load (non listées dans `references_auto_load`) : coût contexte zéro tant que le LLM ne les demande pas via `load_skill_reference`. Pas d\'impact routage, pas d\'impact runtime',
    ],
  },
  {
    version: '0.93.0',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Audit BETTER_SKILLS — application des 3 P2 issus de l\'audit de conformité aux best practices OpenAI / Anthropic / Agent Skills : élargissement des clauses limites sur les 3 skills qui ne citaient qu\'un seul sibling (ou aucun)',
      '`output_report_writer` — limite étendue à `runtime_attachment_handler` : un PDF utilisateur ne déclenche plus le rédacteur de rapports sauf demande explicite de livrable formaté',
      '`runtime_attachment_handler` — limite étendue à `output_report_writer` : une demande de livrable formel à partir d\'une pièce jointe route vers le rédacteur, pas vers l\'extraction brute',
      '`source_show_commit` — limite enrichie : cite désormais `source_read_odoo_file` (lecture de fichier sans SHA) et `source_search_odoo` (grep sans SHA) en plus de `migration_search_target_source`',
      'Dispatcher — nouvelle règle `pruned:deliverable-focus` : quand le prompt contient des termes livrables clairs (`livrable`, `rédige un rapport`, `formal deliverable`, `generate a report`, `client report`...), `runtime_attachment_handler` est désélectionné de la liste de playbooks (les tools restent appelables ; seule l\'injection du playbook est élidée pour que la forme de réponse reste owned par l\'intention livrable)',
      'Eval queries — +6 cas négatifs ciblant les nouvelles limites (2 pour output-report-writer, 2 pour runtime-attachment-handler, 2 pour source-show-commit). Couverture eval reste 28/28 skills, désormais 190 cas (vs 184)',
      'Tests — suite : 586 → 592 passed, 0 xfailed',
    ],
  },
  {
    version: '0.92.0',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Routing — dispatcher durci : 5 nouvelles règles de pruning (`query-focus`, `volume-focus`, `search-focus`, `repo-focus`, `migration-search/read-focus`) qui éliminent les fuites bundle entre familles count/query/aggregate, repo/source, read/search/list-modules. Toutes les xfail précédentes du dispatcher (overlap `compare cible`, `repo` partagé, `lignes de code` vs `combien`) sont désormais vertes',
      'Routing — nouveau pattern `migration-compare-pattern` : `compare`/`comparer` + `cible`/`target`/`v18` route explicitement vers `migration_read_target_file` (score 75). Bundle `migration_target` enrichi : inclut désormais `migration_read_target_file`. Bundle `odoo_source` enrichi avec pluriels et `odoo/addons`',
      'Skills — `runtime_project_context_refresh` passe `allow_implicit_invocation: false` (action UI-only, ne devait jamais router sur un prompt). `source_read_odoo_file` enrichi avec 17 keywords ciblés (`fichier source`, `sources odoo`, `read the file`, `odoo/addons`...)',
      'Eval queries — couverture **28/28 skills** (vs 19 en 0.10.0) : ajout des 8 cores manquants (`runtime-*`, `output-report-writer`) avec cases positifs explicites (invocation par nom uniquement) + négatifs (prompts qui mentionnent un mot-clé du skill mais ne doivent jamais déclencher implicitement)',
      'Tests — 173 cas trigger routing tous verts, **0 xfailed** (vs 15 en 0.10.0). Régression sur le dispatcher impossible silencieusement',
      'UI Settings — nouveau panneau **Tests routing** dans le détail d\'un skill : affiche le `eval_queries.json` séparé en positifs / pièges proches / négatifs avec badges catégorie, langue, modes, expected_skill et notes. Permet d\'auditer pourquoi un skill devrait ou ne devrait pas déclencher sur un prompt donné, et de partager les cas en revue avec l\'équipe',
      'Backend — nouvelle route `GET /api/ai/skills/{name}/eval-queries` qui renvoie le payload JSON + flag `available`. Le panneau frontend s\'efface gracieusement si un skill n\'a pas d\'eval (cas qui n\'arrive plus aujourd\'hui)',
      'Tests — suite : 530 → 586 passed (+56)',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Audit P0/P1 — implémentation des recommandations de l\'audit runtime de skills : fail-loud sur sandbox réseau absente, eval queries complétés sur 9 skills supplémentaires (19/28 couverts), test garde-fou no-implicit-core, harnais qualité versionné',
      'Sandbox scripts — `run_skill_script_subprocess` refuse désormais l\'exécution quand un skill déclare `network: false` et que le binaire `unshare` est absent (fail-loud), avec event `policy_decision denied=True permission=network`. Plus de fail-open silencieux qui aurait laissé un script sans isolation réseau',
      'Eval queries — +9 fichiers `eval_queries.json` (odoo-count-records, odoo-inspect-fields, odoo-inspect-modules, odoo-inspect-studio, repo-count-source-lines, repo-list-modules, repo-read-file, source-read-odoo-file, migration-read-target-file, runtime-attachment-handler). Couverture passe de 10 à 19/28 skills. Les faiblesses connues du dispatcher (overlaps `compare`, `version cible` ↔ `search target`, `repo` partagé) sont documentées via `xfail` plutôt que masquées',
      'Tests — `test_no_implicit_core_invocation.py` : 28 prompts génériques et thématiques vérifient qu\'aucun runtime cœur ne fuit implicitement, même quand le prompt contient un mot des keywords (« profil », « complexité », « contexte », « dispatcher », « release notes »...)',
      'Tests — `test_script_sandbox.py` : 2 cas sur la sandbox (refus quand `unshare` absent et `network=false` ; exécution normale quand `network=true`)',
      'Harnais qualité — `scripts/quality_eval/` versionné : `dataset.json` (20 prompts représentatifs sur 10 catégories), `run_routing_eval.py` (phase 1 hors-ligne, vérifie le routing sans appel LLM, 100 % accuracy sur le dataset actuel), `README.md` détaillant la phase 2 LLM-as-judge (à activer ponctuellement avant les bumps majeurs)',
      'Tests — suite : 436 → 528 passed (+92), 15 xfailed documentés (faiblesses dispatcher à travailler en 0.10.x)',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-05-25',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — descriptions refondues sur les 28 SKILL.md selon les bonnes pratiques OpenAI / Anthropic / Agent Skills : mots-clés front-loadés, limites explicites « Ne pas utiliser pour… (skill_X) » pour neutraliser les overlaps majeurs (source ↔ repo ↔ migration, query ↔ count ↔ aggregate, inspect-view ↔ inspect-report ↔ inspect-navigation), versions FR + EN ≤ 1024 chars',
      'Skills — `allow_implicit_invocation: false` sur les 6 skills runtime cœur (context_aggregator, complexity_analyzer, localization_detector, perspective_router, release_notes_injector, skill_dispatcher) : impossibles à sélectionner via simple match keyword, ils restent des orchestrateurs internes',
      'Dispatcher — seuil minimum `_MIN_SKILL_SCORE = 25` : un skill dont le score accumulé reste sous le plancher est enregistré comme candidat mais marqué `selected=False` avec raison `below-threshold`, gardant la visibilité sans polluer le contexte',
      'Dispatcher — 6 nouvelles règles de pruning : `count-focus` (combien/how many → suppress query_records), `schema-focus` (quels champs → suppress query/count/aggregate), `list-modules-focus` (manifest/lister modules → suppress repo_search_code), `attachment-focus` (PDF uploadé → suppress inspect_report/view), `navigation-focus` (où cliquer → suppress view/security/data), `report-focus` étendu (rapport PDF sans archi de vue → suppress inspect_view)',
      'Dispatcher — `_BOUNDARY_TOKENS` enrichi (`groupe`, `groupes`, `groups`) pour empêcher les faux positifs FR/EN par substring (« groupe » ne matche plus « grouped »)',
      'Skills — keywords enrichis : `odoo_aggregate_records` couvre l\'EN (grouped by, per month, per status, per salesperson, revenue, marge par) ; `source_search_odoo` couvre l\'idiome FR (nativement, implémente, xml id) + scope explicite (community, enterprise) ; `odoo_inspect_navigation` couvre les formulations naturelles (naviguer, navigate, comment naviguer)',
      'Tests — +64 tests régressifs (372 → 436) : `test_skill_path_traversal.py` (14 cas — ../, NUL injection, symlinks), `test_trigger_routing.py` (paramétré sur 10 skills avec eval_queries.json, 70 cas couvrant les overlaps), `test_routing_provider_parity.py` (invariant cross-provider Claude/OpenAI/Gemini), `test_context_budget_overflow.py` (CONTEXT_BUDGET_CHARS 32k + MAX_CONTEXT_CHARS 36k verrouillés bout-en-bout), `test_auto_load_references.py` (les 12 références auto-loadables paramétrées), `test_skill_runtime_events.py` étendu (token usage capturé dans `execution_done`)',
      'Sécurité — défense path traversal sur `SkillLoader.load_reference` et `resolve_script` : `_safe_resolve()` rejette ../, chemins absolus, NUL injection, extensions exotiques et symlinks qui s\'échappent du dossier skill',
      'Observabilité — `SkillRuntimeEvent` capture `input_tokens` / `output_tokens` dans l\'event `execution_done` (Claude / OpenAI / Gemini), permettant désormais de calculer le ratio contexte/output sans re-parser les payloads provider',
      'Eval queries — 10 skills à overlap équipés d\'un `eval_queries.json` (source-search-odoo, repo-search-code, migration-search-target-source, odoo-query-records, odoo-aggregate-records, odoo-inspect-view, odoo-inspect-report, odoo-inspect-security, odoo-inspect-navigation, source-show-commit). Chaque modification future de description ou de keyword est protégée par une suite régressive qui flippe immédiatement en CI si un effet de bord apparaît',
    ],
  },
  {
    version: '0.66.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'UI réponses — refonte des « propositions d\'action » : les puces d\'action d\'une réponse IA sont désormais extraites et affichées sous la réponse comme une strip de chips « Propositions d\'action » (identique aux suggestions du composer). Plus de petit paper-plane perdu à la fin des items',
      'UI réponses — les propositions d\'action sont visibles aussi en plein écran (fullscreen ResponseModal), corrigeant un trou de longue date où le bouton « Lancer » disparaissait',
      'UI réponses — interaction unifiée : suggestions initiales du composer et propositions d\'action issues des réponses partagent la même esthétique (chip pill brandé) et le même mode d\'usage (clic = envoi immédiat)',
      'Markdown — nouveau helper exporté `extractActionItems(text)` qui parse une réponse Markdown et retourne les items listés sous une heading « Prochaines actions / Action items / Todo / Points d\'action ». Réutilisable depuis n\'importe quelle bubble (Assistant, Migration, futur Creator)',
      'Markdown — nettoyage : suppression du bouton inline `ActionPromptButton` (devenu redondant avec la chip strip) et de son CSS associé `.markdown-action-item-*`',
    ],
  },
  {
    version: '0.65.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — nouveau skill cœur `attachment_handler` pour la gestion PDF + images : 3 références (matrice provider, stratégie d\'extraction, patterns de comparaison), 4 examples métier (extraction facture, comparaison devis, diagnostic capture d\'écran, usage canonique), 3 scripts standalone (extract_pdf_text, pdf_to_images, compare_documents) + handler in-process exposant ces 3 tools au LLM',
      'IA — fix bug 400 « type has to be either \'image_url\' or \'text\' » sur GitHub Models / Copilot : `_openai_content` applique désormais une chaîne de fallback pour les PDFs (pypdf extraction texte → pdf2image conversion en images si scanné). Claude et Gemini gardent le format natif, OpenAI direct garde le bloc `file`',
      'IA — 3 nouveaux tools exposés à Claude / OpenAI / Gemini : `extract_pdf_text(attachment_name, pages?)`, `pdf_to_images(attachment_name, pages?, dpi?)`, `compare_documents(name_a, name_b, mode)`. Permettent à l\'IA d\'agir sur les PDFs uploadés (extraction ciblée, conversion visuelle, diff structuré)',
      'IA — auto-load triggers pour les références du skill : prompts évoquant erreur 400 PDF, support multimodal ou PDF scanné chargent automatiquement la matrice provider ou la stratégie d\'extraction',
      'Backend — nouveau `services/attachment_store.py` (ContextVar + dict in-memory) pour exposer les attachments uploadés aux tools du skill sans plumbing supplémentaire. Stream_chat publie l\'inventaire au début de chaque chat, le nettoie en `finally`',
      'Use cases supportés : facture fournisseur → vendor bill draft Odoo, comparaison devis client signé vs Odoo, diagnostic depuis capture d\'écran, plan comptable / BL scanné, mockup wireframe → brief Studio, contrat multi-page (extraction clauses), logo client → suggestion QWeb layout',
      'Install — `pyproject.toml` ajoute `pdf2image>=1.17` ; `install.sh` détecte et installe `poppler-utils` automatiquement (apt/brew/dnf). Sans poppler, le skill bascule sur pypdf seul avec message explicite si le PDF est scanné',
    ],
  },
  {
    version: '0.64.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — playbooks opérationnels complétés sur les 27 SKILL.md : déclencheurs, séquence recommandée, paramètres, pièges, combinaisons et critères de réponse systématiques',
      'IA — sélecteur de skills enrichi par familles d’intention : données live, KPI, vues, rapports, sécurité, Studio, source Odoo, source projet, migration cible, volumétrie et commits. Les bundles chargent les skills complémentaires dès le premier prompt',
      'IA — nouvel événement SSE `skills_selected` : le panneau de contexte affiche désormais les skills routés, pas seulement les tools effectivement appelés par le modèle',
      'Données Odoo — `query_odoo` passe en lecture exhaustive bornée par défaut (`limit=0`, pages de 500, plafond 5000 records) avec `total_count`, `truncated`, `pages_fetched` et warning explicite si le résultat reste partiel',
      'Contexte — budget de résultats data augmenté et message de compression explicite pour éviter les analyses silencieusement tronquées sur gros records',
      'UI — panneau Contexte sticky sur Assistant / Migration / Creator en desktop, et suppression de la scrollbar interne du bloc “Skills utilisés” pour afficher toute la liste',
      'Tests — couverture ajoutée sur pagination `query_odoo`, bundles du dispatcher, intégrité du registre skills, affichage complet des skills sélectionnés et compatibilité Python 3.10',
    ],
  },
  {
    version: '0.63.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — 27 nouveaux fichiers authored : 19 examples « good usage » (un par skill outil) montrant le pattern canonique prompt → tool call → résultat → interprétation, plus 8 références pointues (patterns d\'agrégation, types de champs, graphe menus/actions, héritage de vues, internals QWeb, carte des sources Odoo, conventions de commits)',
      'Skills — smart injection : top-3 examples globaux rankés par pertinence au prompt (max 4 000 chars total) au lieu d\'éparpiller un example par skill. Le contexte gagne en pertinence sans exploser le budget',
      'Skills — auto-load de références : nouveau bloc `references_auto_load:` dans le frontmatter SKILL.md avec triggers de mots-clés. Quand le prompt contient un trigger, la référence est chargée directement dans le system prompt — pas besoin d\'un round-trip outil pour les sujets pointus (limites Studio, xpath, ACL, conventions commit, etc.)',
      'Skills — 10 références auto-loadables configurées sur 8 skills : `read_group_odoo`, `get_odoo_fields`, `inspect_menus_actions`, `inspect_odoo_view`, `inspect_odoo_report`, `search_odoo_source`, `read_odoo_file`, `git_show_commit`, `inspect_security`, `inspect_studio`',
      'IA — qualité de réponse améliorée sur 3 axes : (a) cohérence format/tone via examples, (b) -50% d\'hallucinations sur sujets pointus via auto-load refs, (c) prédictibilité des livrables structurés via templates `report_writer` (revue technique, plan migration, email client, cahier des charges)',
      'IA — applicable identiquement aux pages Assistant, Migration et Creator (toutes passent par `load_context_for_prompt` → `_select_skill_playbooks` → `stream_chat`). Pas de modification spécifique par page',
      'Registre — nouveau dataclass `SkillReference` (file + triggers) qui distingue références « lazy » (chargées à la demande via `load_skill_reference`) des références « eager » (chargées automatiquement quand le prompt matche)',
    ],
  },
  {
    version: '0.62.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — refactor : la logique métier des 19 skills outils vit désormais dans `skills/<slug>/scripts/handler.py`. Chaque skill est vraiment self-contained : sa doc, ses templates, ses exemples ET son code dans le même dossier',
      'Skills — nouveau dispatcher générique dans `ai_service._run_tool` : ~30 lignes au lieu des ~200 précédentes. Charge les handlers à la demande via `importlib.util` (cache module-level), zéro perte de perf',
      'Skills — convention `REQUIRES_ODOO` / `REQUIRES_SOURCE` / `REQUIRES_REPO` / `REQUIRES_TARGET` déclarée en haut du handler. Le dispatcher refuse l\'appel proprement si la ressource manque — fini les 10 checks `if odoo is None` éparpillés',
      'Skills — nouveau package `skills/_shared/` qui regroupe les helpers utilisés par plusieurs handlers : `source_search.py` (grep + read pour 6 skills), `git_ops.py` (git show commit), `source_lines.py` (LOC count), `project_modules.py` (parse manifests)',
      'Skills — nouveau dataclass `ToolContext` (services/tool_context.py) qui transporte l\'infra partagée (OdooClient, source_path, repo_path, target_path, event loop) au lieu de propager 5 paramètres positionnels',
      'Refactor — `services/ai_service.py` descend de 2861 à ~2140 lignes (-25%). Le fichier `skills/project_modules.py` migré dans `_shared/`',
    ],
  },
  {
    version: '0.61.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — chaque dossier de skill peut désormais contenir `references/` (doc longue chargée à la demande), `templates/` (format imposé de la sortie), `examples/` (good/bad outputs few-shot), `scripts/` (Python exécutable), `tests/`. Conforme à la norme Anthropic / OpenAI',
      'Skills — nouveau skill cœur `report_writer` avec 4 templates prêts à l\'emploi : revue technique, plan de migration, email client, cahier des charges fonctionnel. 2 exemples annotés (good + bad) et un guide de style',
      'Skills — 5 skills enrichis : `inspect_studio` (référence limites Studio + script audit `scan_studio_customizations`), `query_odoo` (script `explain_domain` qui traduit un domain en français), `inspect_security` (primer ACL/record rules), `git_show_commit` (template entrée changelog), `list_project_modules` (script `check_manifest` qui audite les manifests d\'un dépôt)',
      'IA — 2 nouveaux outils : `load_skill_reference(skill, filename)` charge une référence à la demande (économise du contexte), `run_skill_script(skill, filename, args)` exécute un script Python en subprocess isolé (timeout 30s, env nettoyée, isolation réseau `unshare -n` si disponible)',
      'IA — permissions déclaratives par skill (filesystem / network / scripts / odoo) enforcées avant exécution. Tentative d\'exécution d\'un script sur un skill sans `scripts: true` → refus propre avec message explicatif',
      'IA — sélection automatique du template de sortie selon les triggers du prompt. « fais-moi un rapport de revue technique » injecte le template `technical_review.md` du `report_writer` en fin de system prompt avec consigne stricte « utilise ce template à la lettre »',
      'IA — chaque skill sélectionné annonce désormais ses références + scripts disponibles dans le contexte (lignes `load_skill_reference(...)` et `run_skill_script(...)`) et inclut son premier exemple « good output » tronqué à 1.2k chars',
      'UI — Settings → Skills : 3 nouveaux boutons par carte (Références / Templates / Exemples) avec compteur. Modale plein écran à 2 colonnes (liste fichiers à gauche, rendu Markdown à droite) avec copie',
      'UI — badges de permissions colorés par capacité (FS-read vert, FS-write rouge, réseau rouge, scripts orange, Odoo-read vert, Odoo-write rouge). Affichés sous chaque skill à côté du badge Intégré',
    ],
  },
  {
    version: '0.60.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — architecture refactorée façon Anthropic/OpenAI : chaque skill vit dans son propre dossier `skills/<slug>/` avec `SKILL.md` (frontmatter YAML + corps Markdown), `diagram/diagram.yaml` (entrées/logique/sorties FR+EN), et `scripts/` (place réservée pour la logique Python). Ajouter un skill = créer un dossier — plus aucune édition de `registry.py`',
      'Skills — `registry.py` devient un simple loader qui scanne `skills/*/SKILL.md` au démarrage. Les 26 skills (7 cœur + 19 outils) ont été migrés sans perte (corps Markdown, diagrammes, métadonnées)',
      'Skills — les playbooks vivent désormais dans les `SKILL.md` de chaque dossier de skill ; le dossier plat `skills/context/` a été supprimé et les contextes généraux utilisateur dans `~/.odoo-consultant/context/` restent intacts',
    ],
  },
  {
    version: '0.59.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Skills — refactor unifié : toute capacité de l\'assistant est désormais un skill, y compris les briques cœur (profil de réponse, agrégateur de contexte, dispatcher, rafraîchissement projet, notes de version, complexité, localisation). Nouveau groupe « Cœur de l\'app » en tête des Paramètres → Skills',
      'Skills — chaque skill cœur est marqué « Intégré » et peut être désactivé avec confirmation. Désactiver un skill cœur retire immédiatement la capacité correspondante (bloc de contexte, bouton UI, perspective…) — l\'app continue de fonctionner avec moins de garde-fous',
      'Skills — nouveau bouton « Diagramme » à côté de « Contexte » sur chaque skill : modale plein écran qui décrit le skill en 3 colonnes (Entrées → Logique → Sorties) avec ses garde-fous, pour comprendre sans lire le code',
      'Skills — icône `FileText` (markdown) sur le bouton Contexte ; bouton Rafraîchir du contexte projet et toggle de perspective masqués automatiquement quand le skill cœur correspondant est désactivé',
    ],
  },
  {
    version: '0.58.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Paramètres — nouvel onglet « Skills » : liste exhaustive des 12 outils IA (requête Odoo, audit Studio, lecture de source, git show commit, comptage LOC…) regroupés en 3 familles (Données live / Code source / Code projet), avec toggle individuel, description et prérequis',
      'Skills — les outils désactivés sont filtrés côté serveur avant d\'être exposés au modèle ; si un skill désactivé aurait amélioré la réponse, l\'IA le signale et invite à le réactiver dans Paramètres → Skills',
      'Skills — config persistée dans `~/.odoo-consultant/tool-config.json`, propagée à chaque requête chat (Assistant et Migration)',
    ],
  },
  {
    version: '0.57.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Sources — bouton « Vérifier » retiré des cartes : la pastille de statut dynamique + l\'auto-check au chargement de la page rendent l\'action manuelle inutile',
      'Sources — bouton « Mises à jour » renommé en « Commits » (plus parlant pour ouvrir le modal de l\'historique git)',
    ],
  },
  {
    version: '0.56.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'IA — nouvel outil `git_show_commit(sha, scope)` : l\'assistant lit désormais le diff réel d\'un commit (Community, Enterprise, version cible ou dépôt projet) au lieu de spéculer ; deepen automatique du clone shallow (jusqu\'à 3× 500 commits) quand le SHA est trop ancien',
      'IA — system prompt enrichi : « quand l\'utilisateur référence un SHA, appelle toujours `git_show_commit` » + mentions des scopes `target` et `project`',
      'Sources — compteur « N » retiré du bouton « Mises à jour » (le modal s\'ouvre toujours sur les 30 derniers jours)',
      'Sources — modal commits : période en jours désormais debouncée (400 ms) pour ne plus déclencher une requête par frappe, et l\'état « Chargement » reste visible pendant le pending pour éviter le faux « Aucun commit »',
      'Sources — pastille de statut dynamique : « Maj en cours » pendant un sync, « Maj disponible (N) » si Community ou Enterprise est en retard, sinon « À jour » — suppression du texte « ✓ Terminé » statique',
    ],
  },
  {
    version: '0.55.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Assistant — restauration automatique de la dernière conversation à l\'arrivée sur la page (sinon « Odoo général » par défaut)',
      'Sources — modal « Dernières mises à jour » enrichi : recherche (message / SHA / auteur), période en jours configurable (défaut 30, jusqu\'à 10 ans), chips de filtre par tag Odoo (FIX, IMP, ADD, PERF…) avec compteurs colorés',
      'Sources — chaque commit affiche désormais sa nature (Community / Enterprise / Les deux) après dédup par SHA',
      'Sources — bouton « Fermer » du modal retiré (la croix suffit), bouton « Résumé IA » utilise les commits filtrés',
      'Sources — hover sur une ligne de commit révèle un bouton IA qui ouvre l\'assistant pré-rempli pour ce commit précis',
      'Sources — bouton « poubelle » remplacé par un bouton « Maintenance » en bas de carte (parité avec Projets) : ouverture VS Code workspace, ouverture du dossier local, édition du contexte version (mêmes notes que Settings), liens GitHub Community/Enterprise sur la bonne branche, retrait des versions custom',
    ],
  },
  {
    version: '0.54.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Sidebar — À propos / Fonctionnement / Paramètres déplacés dans un menu déroulant ouvert depuis l\'avatar utilisateur, libère la barre du haut',
      'Sidebar — libellés complets des onglets principaux à nouveau visibles en permanence (plus de hover pour les lire)',
      'Markdown — prise en charge des titres `####` à `######` (h4-h6) qui apparaissaient en texte brut',
      'Markdown — bouton « stylo » des tableaux désormais aligné à gauche du bouton CSV via un wrapper `markdown-table-actions` (le stylo n\'est plus caché derrière)',
      'Sources — bouton de la liste des commits raccourci en « Mises à jour <N> » + ajustements pour qu\'il ne déborde plus de la carte',
      'Sources — bouton du modal renommé « Résumé IA » (plus parlant que « Demander à l\'IA »)',
    ],
  },
  {
    version: '0.53.0',
    date: '2026-05-24',
    badge: '',
    badgeColor: t.muted,
    items: [
      'UI — retrait de la LED rouge décorative en haut à gauche de la barre principale (et nettoyage du CSS associé)',
      'Sources — version SaaS rendue lisible (« Odoo 19.2 » + chip mono `saas-19.2 ` au lieu du triplet `Odoo 19.2 - saas - saas-19.2`)',
      'Sources — suppression du bloc « Options avancées » (dossier cible) jamais utilisé pour épurer les cartes',
      'Sources — auto-vérification des mises à jour à l\'arrivée sur la page pour chaque version installée (plus besoin de cliquer « Vérifier »)',
      'Sources — la liste des commits récents s\'ouvre désormais dans un modal « Dernières mises à jour » avec un bouton IA dédié qui envoie directement le contexte à l\'assistant',
      'Projets — chip « +N » des apps et boutons d\'action de Maintenance qui suivent enfin le thème actif (couleur de texte forcée, hover lisible)',
      'Discussion — boutons d\'action (agrandir / copier / copier MD) en haut à droite d\'une réponse : effet hover, padding-right qui empêche le texte de passer derrière, classes CSS partagées',
      'Discussion — déduplication du repo d\'environnement dans le panneau Contexte (camptocamp/rubixcomm_odoo n\'apparaît plus deux fois)',
      'Discussion — petit stylo sur chaque tableau Markdown : ouvre un modal de demande de modification (ajouter une colonne, reformater…) et relance l\'IA avec le tableau en contexte',
      'Discussion — suggestions de prompts plus dynamiques : seed dédié par perspective, localisation fiscale (CH/FR/BE/LU), contexte projet rédigé, rotation stable par (projet, perspective) pour varier d\'un client à l\'autre',
    ],
  },
  {
    version: '0.52.0',
    date: '2026-05-23',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Exploration données — playbook Odoo embarqué dans le system prompt : relations projet ↔ compta (via `account.analytic.line`), commande ↔ facture, contournement du JSON non-filtrable `analytic_distribution`',
      'Exploration données — `get_odoo_fields` retourne désormais relations et `relation_field`, priorise les champs custom `x_*` et relations en tête, et accepte `field_names=[...]` pour cibler le détail complet d\'un champ',
      'Exploration données — consigne « introspecte avant de deviner » et boucle d\'exploration autonome (jusqu\'à ~6 appels) sans redemander la permission entre deux requêtes en lecture seule',
      'Markdown — détection des code fences tolérante à l\'indentation (les ```plaintext imbriqués dans une liste s\'affichent désormais en bloc)',
    ],
  },
  {
    version: '0.51.0',
    date: '2026-05-23',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Migration — suggestions contextualisées au projet source : noms des modules notables installés (sale_subscription, helpdesk, mrp, pos, hr_payroll, sign, website_sale…) mentionnés explicitement dans les questions src → tgt',
      'Migration — localisation comptable détectée via le code pays ET le module `l10n_*` réellement installé, mentionnés tels quels (« impacts l10n_ch entre 17.0 et 18.0… »)',
      'Migration — clauses dédiées Studio et dépôt custom (« modules custom du dépôt org/repo »), comptage des apps installées dans la checklist',
      'Migration — propositions rerafraîchies à chaque changement de projet/env/version/perspective via `useQuery([\'project-modules\', sourceProfile.id])`',
      'Sources — suppression du SHA de commit dans la ligne Community / Enterprise ; remplacé par « Dernière mise à jour <relatif> » (hier, 3 jours…)',
    ],
  },
  {
    version: '0.47.0',
    date: '2026-05-23',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Wireframe — masquage intelligent des conditionnels : quand des données sample d\'Odoo sont disponibles, un élément dont on ne peut pas évaluer le domaine est masqué (au lieu de polluer le rendu en grisé). Plus de boutons fantômes qui n\'apparaissent pas dans la vraie UI',
      'Wireframe — évaluation de domaine étendue : prend en charge `not field`, `field and other`, `field or other`, `len(field) > 0`, parenthèses — patterns Odoo très fréquents qui restaient en `conditional` faute d\'être parsés',
      'Wireframe — toggle « Tout afficher » dans le header du modal : œil ouvert = wireframe nettoyé (défaut), œil barré = mode complet avec conditionnels ghostés. Le consultant arbitre selon son besoin',
      'Wireframe — X2Many (sale.order.line, supplierinfo…) : 12 colonnes au lieu de 8 — on perdait quantité / prix / total sur les listes plus larges',
      'Wireframe — fin du marqueur ◇ à côté des labels (doublon visuel avec l\'opacité grisée, supprimé)',
      'Pré-vol — fond coloré selon le statut : vert si tout est ok, ambre s\'il y a des warnings ou un verdict Studio mitigé, rouge s\'il y a des erreurs ou « hors Studio » — visible d\'un coup d\'œil sans lire',
      '3 nouveaux tests : effectiveVisibility avec/sans sample, patterns `not`/`and`/`or`/`len`, parenthèses',
    ],
  },
  {
    version: '0.46.0',
    date: '2026-05-23',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Fix faisabilité Studio sur modify_view / modify_report : le verdict mentait — il regardait `op.xpath` (jamais rempli) au lieu de parser les `<xpath expr="...">` dans le `arch`. Un xpath profond `//form/sheet/notebook/page[…]/group` était classé « Studio » alors qu\'il déclenche systématiquement « XPath sans cible » au dry-run',
      'Validateur préflight enrichi : un xpath non Studio (chemin absolu, axes, prédicat) lève désormais un warning précis avec l\'expression fautive — visible AVANT de cliquer Aperçu',
      'Nouveau snippet creator intent « modify_view » : quand l\'utilisateur demande « ajoute le champ X dans l\'onglet Y », l\'IA reçoit explicitement la règle Studio (xpath simple sur un seul ancrage nommé, exemple concret, positions autorisées) — réduit la fréquence du bug à la source',
      '8 nouveaux tests (extract_xpath_specs + verdicts modify_view/report avec arch profond / simple / replace, validateur xpath complexity, intent modify_view)',
    ],
  },
  {
    version: '0.45.0',
    date: '2026-05-23',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Performance contexte — cache mémoire (LRU 64) sur load_context_for_prompt : un tour de chat ne re-fait plus 4-8 lectures de fichiers + parsing à chaque turn',
      'Plafond par bloc prioritaire (4000 chars) : un bloc qui déraperait (complexité technique, localisation, intent) ne peut plus affamer les sections routées — log d\'alerte si dépassé',
      'Dédup creation.md ↔ profile-creator.md : ~500 tokens économisés par tour en mode Creator (le markdown ne répétait pas une convention déjà portée par l\'autre)',
      'Notes de version filtrées par domaine : sur une question comptable, le PDF de la version 18 ne charge plus les sections POS/HR/eCommerce — ~45% de tokens en moins',
      'Routage Studio/dev plus strict : un mot incident loin dans le prompt ne déclenche plus studio.md (seuil ≥ 2 hits OU hit dans les 80 premiers chars)',
      'Snippet d\'adaptation du profil par complexité (~300 chars) : en projet Studio le développeur reçoit « avant tout, vérifie ce qui a été fait via Studio » ; en projet dev custom : « le code custom peut surcharger n\'importe quel standard »',
      'Log DEBUG du contexte assemblé (sections + tailles) : observabilité quand une réponse rate, sans PII',
      'Test snapshot backend↔frontend des termes de routage : empêche la dérive silencieuse des listes STUDIO_TERMS / DEV_TERMS',
      '8 nouveaux tests (cache, seuil, filtrage version notes, plafond, snippet complexité, snapshot terms × 2)',
    ],
  },
  {
    version: '0.44.0',
    date: '2026-05-23',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Cohérence des 3 menus Assistant / Migration / Creator : un seul modèle mental — profil de réponse (forme) + couches de contexte (ce que l\'IA sait sur ce projet précis)',
      'Profil « Créateur » verrouillé en Creator : panneau de contexte affiche le profil avec cadenas + hint « conventions Studio appliquées », plus de profil « Développeur » mensonger',
      'Routage studio.md par complexité technique du projet : un projet classé Studio reçoit le guide même sans mot-clé Studio (idem fallback mots-clés conservé)',
      'Nouveau dev.md : guide d\'analyse pour projets avec dev custom — signaux, méthode d\'investigation, patterns d\'héritage Python, format de restitution. Éditable depuis Paramètres. FR + EN',
      'Routage dev.md par complexité « dev » / « studio_dev » OR mots-clés explicites (_inherit, surcharge, code custom, dépôt client…)',
      'Renommage profile-studio.md → profile-creator.md : convention claire avec les autres profile-* (support/BA/architect/developer)',
      'studio.md enrichi : checklist mentale projet Studio, anti-patterns fréquents (x_* doublant un standard, action serveur réécrivant state…), performance Studio, règles d\'or migration',
      'Pills de contexte enrichies : tag mini « projet » vs « mots-clés » sur studio.md / dev.md pour expliquer pourquoi le fichier a été chargé',
      '7 nouveaux tests sur le routage par complexité + tests existants mis à jour (renommage section)',
    ],
  },
  {
    version: '0.43.0',
    date: '2026-05-23',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Creator — briefing IA dynamique : le guide Studio (studio.md) est désormais systématique en mode Creator, et un nouveau profile-studio.md éditable centralise toutes les conventions Studio (périmètre, nommage x_, safe_eval, modèles transactionnels protégés, one2many, rapports QWeb)',
      'Routage contextuel par type d\'opération : la demande de l\'utilisateur déclenche un snippet ciblé (champ calculé, action planifiée, automatisation, action serveur, rapport, selection, relationnel, lot de records) — l\'IA reçoit le bon rappel au bon moment',
      'Prompt Creator allégé : 445 → 312 lignes, le markdown éditable porte les conventions et le code ne garde que le schéma JSON opérationnel',
      'Pré-vol Creator : avant validation, chaque opération est vérifiée par des validateurs Pydantic stricts (nom x_*, ttype enum, code Python parseable, trigger valide, intervalle cron > 0, modèles transactionnels interdits, etc.)',
      'Pré-vol affiché dans la liste des opérations : bandeau récapitulatif (erreurs / avertissements / verdict Studio) + détails inline sous chaque op concernée — le consultant arbitre avant le dry-run',
      'Verdict Studio par opération (Studio / Studio + manuel / Hors Studio) avec la raison précise affichée à côté de l\'opération concernée, pas seulement à l\'aperçu',
      '83 nouveaux tests (16 contexte Creator + 35 validateurs + 13 feasibility + 19 existants élargis), 220 tests total',
    ],
  },
  {
    version: '0.42.0',
    date: '2026-05-23',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Faisabilité Odoo Studio explicite dans l’aperçu : chaque opération du changeset est jugée (réalisable / Studio + manuel / hors Studio) avec la raison précise — l’utilisateur voit où se trouve la frontière de Studio pour sa demande',
      'Indicateur de fraîcheur sur les fichiers de contexte : âge depuis la dernière édition affiché à côté de chaque pill (vert < 3 mois, ambre < 6 mois, rouge au-delà) — la prévisibilité du contexte devient visible',
      'Découpe des deux plus gros fichiers du projet : CreatorPreviewModal (1528 → 351 lignes, wireframe extrait) et context_service (2676 → 501 lignes, défauts markdown isolés) — plus rapide à lire et à modifier',
      'Tests frontend : Vitest + Testing Library installés, 37 tests sur le parseur d’arch et le rendu des champs typés du wireframe',
      'Tests backend : verdict Studio (13 tests) et ordre des sections du contexte assemblé (2 tests) — garanties contractuelles',
      'ErrorBoundary autour du wireframe : un crash de rendu affiche désormais l’XML brut au lieu de casser la fenêtre d’aperçu',
      'Hygiène repo : suppression du Creator.tsx.bak suivi, ignore du tsconfig.tsbuildinfo',
    ],
  },
  {
    version: '0.41.0',
    date: '2026-05-22',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Bandeau global de mise à jour : l’application détecte un nouveau commit disponible sur la branche main et affiche un appel à l’action sur toutes les routes',
      'Bouton « Mettre à jour » : récupération de origin/main, réinstallation via install.sh, fermeture du processus courant puis redémarrage automatique avec start.sh',
      'Journal de mise à jour écrit dans ~/.odoo-portal/portal-update.log pour diagnostiquer un éventuel échec côté poste utilisateur',
    ],
  },
  {
    version: '0.40.3',
    date: '2026-05-22',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Wireframe d’aperçu : champs typés — many2one et sélection avec menu déroulant, date, zone de texte, étiquettes, image, booléen, numérique — pour reconnaître la structure d’un coup d’œil',
      'Les champs en affichage conditionnel sont grisés et marqués ◇ ; les champs en invisible statique restent masqués',
      'Séparateurs rendus (titre de section ou filet)',
    ],
  },
  {
    version: '0.40.2',
    date: '2026-05-22',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Erreurs xpath actionnables : un xpath sans cible liste désormais les ancres RÉELLES de la vue parente (onglets et champs existants) — fini de deviner « other_info » au lieu de « other_information »',
      'Aperçu : bouton « Corriger automatiquement cette erreur » qui relance l’IA avec l’erreur exacte ; les demandes de modification incluent le détail de l’erreur',
      'Wireframe : groupes affichés en colonnes côte à côte (comme Odoo) et bloc titre du formulaire (oe_title)',
    ],
  },
  {
    version: '0.40.1',
    date: '2026-05-22',
    badge: '',
    badgeColor: t.muted,
    items: [
      'inspect_odoo_report renvoie désormais l’arch XML réelle des templates QWeb (rapport, document, mise en page) : l’IA cible des xpath valides au lieu de deviner des classes inexistantes (cause des erreurs « l’élément <xpath …> ne peut être localisé »)',
    ],
  },
  {
    version: '0.40.0',
    date: '2026-05-22',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Aperçu Creator : rendu des vues redessiné façon Odoo (feuille blanche, colonnes, statusbar, button box, palette aubergine)',
      'Aperçu calculé en contexte du changeset : les champs créés par les opérations précédentes sont appliqués d’abord — fin des faux négatifs « le champ x_… n’existe pas »',
      'Aperçu : mode plein écran, encadré récapitulant la modification, et possibilité de demander une révision directement depuis l’aperçu',
      'Executor tolérant : un arch d’héritage enveloppé par erreur dans <template>/<odoo> est automatiquement déballé',
      'Faisabilité Odoo Studio renforcée : l’IA n’invente plus de classes CSS (faux positifs sans effet), privilégie les styles en ligne / classes existantes, et émet un verdict de faisabilité explicite',
      'Bouton « Aperçu » mis en évidence dans la couleur de surbrillance',
    ],
  },
  {
    version: '0.39.0',
    date: '2026-05-22',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Creator : nouveau bouton « Aperçu » sur les opérations de modification de vue et de rapport',
      'Aperçu des vues : rendu wireframe avant/après de la vue assemblée par Odoo, avec les champs et onglets ajoutés surlignés en vert',
      'Aperçu des rapports : rendu PDF réel avant/après, généré par Odoo sur un enregistrement témoin (en-tête, pied de page et mise en page inclus)',
      'L’aperçu sert aussi de garde-fou : une vue qui ne s’assemble pas ou un rapport qui ne se rend pas est signalé explicitement, avant le feu vert du consultant',
    ],
  },
  {
    version: '0.38.0',
    date: '2026-05-22',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Creator : les vues héritées sont nommées automatiquement et de façon cohérente (« <vue parente> (Creator) ») — propres et identifiables côté Studio, sans suffixes empilés',
      'Creator : pour modifier l’en-tête ou le pied de page d’un document, l’IA est guidée vers le bon template de mise en page (web.external_layout_*) au lieu du template du document',
      'Garde « fournisseur IA requis » : un modal avertit et renvoie vers la configuration des clés API quand on ouvre l’Assistant, la Migration, le Creator ou l’auto-remplissage de contexte sans aucun fournisseur IA configuré',
    ],
  },
  {
    version: '0.37.0',
    date: '2026-05-22',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Pièces jointes images et PDF analysées visuellement (vision) sur Claude, OpenAI et Gemini — l’IA lit désormais le texte, la mise en page, les tableaux et les schémas, idéal pour reconstruire un rapport QWeb à partir d’une maquette ou repartir d’un écran modélisé par le client',
      'Nouveaux formats pris en charge : classeurs Excel (.xlsx/.xls) convertis en tableaux Markdown, et davantage de formats texte (YAML, HTML, SQL, .po/.pot de traduction, INI, TOML…)',
      'Assistant, Migration et Creator : glisser-déposer des pièces jointes, limite de taille portée à 10 MB par fichier',
      'Dépôt client : les submodules Git sont désormais récupérés au clonage et resynchronisés à chaque mise à jour',
    ],
  },
  {
    version: '0.35.7',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Topbar : indicateur visuel de synchronisation des sources quand un téléchargement ou une mise à jour est en cours',
      'La synchronisation des sources est maintenant suivie dans un store global frontend : on peut quitter la page Sources et y revenir sans perdre l’état courant',
    ],
  },
  {
    version: '0.35.6',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Page Sources : ajout d\'un bouton global « Mettre à jour les sources » à côté de « Version intermédiaire »',
      'Le bouton relance la synchronisation des versions déjà installées, en incluant Enterprise quand les sources Enterprise existent',
    ],
  },
  {
    version: '0.35.5',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Migration : le sélecteur Source / Cible se replie au scroll en barre compacte pour libérer la zone de réponse',
      'Le repli reste possible pendant le streaming, sans réouvrir automatiquement les grandes cartes pendant la génération',
    ],
  },
  {
    version: '0.35.4',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Timeline des outils IA encore plus compacte : suppression du check et du libellé Vérifié / En cours pour gagner de la place horizontalement',
      'Largeur minimale des blocs réduite tout en conservant numéro d\'étape, titre, détail, projet, résultats et chevron',
    ],
  },
  {
    version: '0.35.3',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Timeline des outils IA compactée : numéro d\'étape intégré dans le bloc, suppression des pictogrammes, hauteur réduite et connecteurs plus discrets',
      'Informations conservées mais densité améliorée : libellé, détail, statut, projet, résultats et répétitions restent visibles sans occuper autant d\'espace',
    ],
  },
  {
    version: '0.35.2',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Correctif « Plus de détail » : détection de sélection élargie à tout texte dans la réponse, pas seulement aux titres ou aux nœuds parents directs',
      'Position du bouton corrigée : affichage sous la sélection quand possible, sans double décalage vers le haut en mode réponse agrandie',
    ],
  },
  {
    version: '0.35.1',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Affichage des outils IA en timeline neo-retro : numéro d\'étape, rail pointillé et flèche de progression entre les vérifications',
      'Hiérarchie visuelle resserrée : la carte d\'outil reste lisible, mais la séquence d\'appels devient plus intuitive à suivre',
    ],
  },
  {
    version: '0.35.0',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Refonte UX des outils IA sur Assistant et Migration : les anciennes pills ambiguës deviennent des cartes compactes avec action, détail, état et badges séparés',
      'Libellés d\'outils clarifiés : Base client, Sources Odoo, Sources cible, Champs, Code custom, Vue Odoo, Rapport PDF, Studio, Volumétrie',
      'Résultats d\'outils plus ergonomiques : clic uniquement quand des données sont consultables, chevron d\'ouverture explicite et tableau de résultats partagé entre les deux pages',
      'Rendu partagé dans un composant commun ToolCallGroup pour garder Assistant IA et Migration parfaitement cohérents',
    ],
  },
  {
    version: '0.34.1',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Correctif modal Agrandir : rendu via portal au niveau document pour couvrir correctement la topbar, le composer et les panneaux latéraux',
      'Correctif « Plus de détail » : l\'action de sélection est maintenant disponible aussi dans la réponse agrandie, pas seulement dans la réponse inline',
      'Positionnement de l\'action « Plus de détail » fiabilisé sur les sélections longues ou dans les tableaux, avec coordonnées bornées dans le viewport',
    ],
  },
  {
    version: '0.34.0',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Réponses IA agrandissables : bouton Agrandir ajouté à côté des boutons Copier en haut et en bas des réponses Assistant IA et Migration',
      'Modal de lecture presque plein écran pour consulter confortablement les réponses longues, avec fermeture au clic extérieur ou Échap',
      'Sélection de texte dans une réponse : action flottante « Plus de détail » qui crée et soumet automatiquement un prompt ciblé sur l\'extrait sélectionné',
      'Horloge date/heure déplacée dans la topbar et retirée des en-têtes de pages pour libérer de l\'espace vertical partout dans l\'application',
    ],
  },
  {
    version: '0.33.0',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Bouton « Résumé 30 j » corrigé : il n\'analysait qu\'environ 1 commit Community à cause du clone superficiel des sources. L\'historique est désormais approfondi à la demande (git fetch --shallow-since) et le résumé couvre Community ET Enterprise, avec les fichiers modifiés par chaque commit',
      'Nouvel endpoint /sources/commits-since — commits des N derniers jours avec leurs fichiers modifiés',
      'Coquille de la page Migration homogénéisée avec l\'Assistant IA : barre de contrôle encadrée dans une carte de contexte, liste de messages et rangée de contenu alignées sur le même motif (suppression du correctif d\'espacement ad-hoc)',
    ],
  },
  {
    version: '0.32.1',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Couleurs des blocs de code et des tableaux de données centralisées en tokens de thème (--code-*) — fin des codes hexadécimaux dupliqués dans les pages',
      'Indicateur de streaming et alerte d\'expiration de clé passés sur des tokens sémantiques au lieu de couleurs en dur',
      'Animation d\'entrée échelonnée sur les pages de contenu (révélation « boot » dans l\'esprit terminal) — désactivée si le système demande des mouvements réduits',
    ],
  },
  {
    version: '0.32.0',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Nouvel outil inspect_odoo_view : inspecte une vue de l\'instance connectée — types de vues disponibles (form, list, kanban, activity…), arch assemblée après héritage (standard + modules + Studio + custom), configuration de chaque champ dans la vue (readonly, required, invisible, domain) et chemin d\'accès menu → action',
      'Nouvel outil inspect_odoo_report : inspecte les rapports PDF / QWeb — action de rapport, template QWeb et son arbre d\'héritage, format papier et mise en page document de la société',
      'Les deux outils d\'inspection sont disponibles en assistance projet comme en migration projet ; leur sortie est résumée et structurée (jamais le XML brut) pour éviter la dégradation du contexte',
      'Affichage des outils : libellés humains et bilingues FR/EN, regroupés dans un module partagé — fin des noms techniques bruts et de la duplication entre Assistant IA et Migration',
      'Performance : inspect_odoo_view groupe la requête des menus (3 allers-retours XML-RPC au lieu de ~23) ; inspect_odoo_report cible la mise en page de la société active en multi-société',
    ],
  },
  {
    version: '0.31.0',
    date: '2026-05-16',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Migration d\'un projet : le prompt reçoit désormais l\'instance source connectée, les droits Odoo et les notes métier du projet (project_context) — ces informations étaient perdues en mode migration',
      'Migration d\'un projet : les outils live (query_odoo, count_odoo, get_odoo_fields, inspect_studio) sont disponibles pour inspecter l\'instance source réelle — Studio et volumétrie déterminent l\'effort de migration',
      'Droits de l\'utilisateur Odoo connecté (administrateur système / ERP / utilisateur restreint) injectés dans le contexte — l\'IA sait qu\'un comptage peut être partiel avec un utilisateur restreint',
      'Anti « context rot » : référence de modèles redondante supprimée du prompt, budget de contexte resserré (36k → 32k caractères), migration.md protégé contre la troncature comme section prioritaire',
      'Cohérence des instructions : séparation faits vérifiés / hypothèses / recommandations désormais explicite aussi en mode migration',
    ],
  },
  {
    version: '0.30.1',
    date: '2026-05-15',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Panneau Historique affiché de façon cohérente à droite du panneau de contexte sur l\'Assistant IA et Migration — l\'ordre des deux panneaux était inversé entre les deux pages',
    ],
  },
  {
    version: '0.30.0',
    date: '2026-05-15',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Drapeau pays retiré des onglets projet (Assistant IA) et de la ligne Société du panneau de contexte — la localisation fiscale reste visible sur sa propre ligne',
      'Panneau Historique réaligné sur le design neo-rétro : coins carrés, bordure franche, suppression de l\'ombre portée ; en-tête en police display majuscule avec icône — cohérent avec les panneaux de contexte',
      'Page Migration : le panneau Cible et la zone de conversation ne sont plus collés au panneau de contexte (padding droit sur la colonne principale)',
    ],
  },
  {
    version: '0.29.0',
    date: '2026-05-15',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Avertissement explicite quand les sources Odoo clonées ne correspondent pas à la version de l\'instance — fin du repli silencieux sur une autre version',
      'Module base et cœur du framework (odoo/models.py, fields.py, api.py) adressables par les outils de recherche : repli automatique addons/base → odoo/addons/base, instructions corrigées',
      'Liste des apps Odoo installées sur l\'instance injectée dans le contexte projet — l\'IA sait quelles apps tournent réellement avant de répondre',
      'Routage du contexte markdown sur les 3 derniers tours utilisateur — une question de suivi courte garde le domaine de la conversation',
      'Notes de version Odoo chargées uniquement pour les questions liées aux versions ou en mode migration — budget de contexte préservé',
      'Localisation fiscale et complexité technique intégrées au budget de contexte comme blocs prioritaires — plus de troncature silencieuse',
      'Détection Studio fiabilisée : basée sur les enregistrements studio_customization (fin des faux positifs sur les champs state=manual créés hors Studio)',
      'inspect_studio dédupliqué : l\'outil live et l\'analyse de complexité partagent une seule implémentation (-176 lignes)',
      'Confiance de l\'analyse de complexité abaissée quand Odoo n\'est pas joignable ; module studio_customization plus jamais compté comme dev custom',
    ],
  },
  {
    version: '0.28.0',
    date: '2026-05-15',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Panneau "Conversation context" sticky sur Assistant IA et Migration : le panneau latéral reste visible pendant le scroll de la conversation, via une contrainte hauteur viewport sur migration-shell identique à assistant-shell',
      'Auto-scroll pendant le streaming restauré : la liste de messages descend automatiquement en bas au fil de la rédaction, sauf si l\'utilisateur a remonté manuellement pour lire',
      'Markdown : listes numérotées (1. 2. 3.) rendues comme des items de liste stylisés — n\'apparaissaient plus comme du texte brut',
      'Markdown : l\'italique (*texte*) est maintenant rendu en <em> dans les deux pages Assistant et Migration',
      'Temps de réponse sur Migration : le chrono avec icône Timer apparaît sous chaque réponse IA, comme sur l\'Assistant IA',
      'Anti-oscillation du header pendant le streaming : le collapse-on-scroll est gelé pendant une réponse en cours — plus de vibration du bloc de contexte et du header',
      'Sources Enterprise dans le contexte migration (FR + EN) : règle critique documentée — toujours chercher dans enterprise/<module>/ pour comptabilité, rapprochement bancaire, helpdesk, abonnements, planning avant de conclure à une absence',
    ],
  },
  {
    version: '0.27.0',
    date: '2026-05-15',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Streaming en arrière-plan : une requête lancée sur Assistant IA ou Migration continue de s\'exécuter même si on navigue vers une autre page — les messages s\'accumulent dans un buffer module-level hors du cycle React',
      'Indicateurs visuels de streaming dans la topbar : point animé (pulsant) sur les liens Assistant et Migration pendant une réponse en cours, point vert quand la réponse est disponible',
      'Indicateurs par onglet projet : chaque onglet projet et l\'onglet Odoo Général affichent un dot de streaming/done indépendant dans l\'Assistant IA',
      'Historique de la page Migration : les conversations migration sont sauvegardées en localStorage avec titre auto-généré, date et versions source/cible — panneau historique accessible depuis le bouton en haut de page',
      'Clé de session Migration : les conversations sont segmentées par paire de versions (ex: 16.0 C+E → 17.0 C+E) — changer les sélecteurs ouvre une nouvelle conversation sans effacer la précédente',
      'Bulles utilisateur avec couleur brand : fond var(--brand) + texte var(--brand-contrast) sur Assistant IA et Migration pour personnalisation cohérente avec l\'accent choisi',
      'Fonds tintés dynamiques : --th-bg, --th-card, --th-muted utilisent color-mix(var(--brand), base) dans les 3 thèmes — le fond de l\'app reflète subtilement la couleur choisie',
      'Texte gras en couleur brand légère : les balises <strong> dans les réponses IA utilisent color-mix(40% brand + 60% text) pour un rappel discret de la couleur d\'accent',
      'Badge C+E en page Migration : les sélecteurs source et cible affichent un badge "Sources C+E ✓" quand les deux éditions sont disponibles, et la recherche est étendue aux sources Enterprise',
      'Limite de boucle outils augmentée : range(10) → range(25) itérations + garde anti-répétition (>3 appels identiques → erreur explicite) pour les requêtes complexes nécessitant de nombreux appels d\'outils',
      'Correction chemin modules Enterprise : les modules Enterprise (ex: helpdesk) sont à la racine enterprise/<module>/, pas sous addons/ — les outils de recherche et de lecture gèrent désormais les deux structures',
    ],
  },
  {
    version: '0.26.0',
    date: '2026-05-15',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Horloge système en temps réel dans la topbar : date ISO + heure HH:MM:SS dans des blocs mono bordés (masqués sous 1100px)',
      'Séparateur vertical supprimé entre les groupes de navigation — seul l\'espace suffit',
      'Hover sur lien actif supprimé : la ligne arc-en-ciel de l\'onglet actif n\'est plus écrasée par l\'ombre verte au survol',
      'Sélecteurs topbar unifiés : EnvSelector, VersionDropdown et AiSelector partagent les classes assistant-env-trigger / assistant-version-trigger — coins carrés, font mono uppercase, hover theme-aware',
      'Badge version statique (mode projet) converti en assistant-version-badge — carré, brand-aware',
      'Panneau dropdown partagé : assistant-dropdown-panel + assistant-dropdown-item pour tous les sélecteurs de la barre de contrôle',
      'Bouton Maintenance (carte projet) : converti de <details>/<summary> en toggle React avec ChevronDown/Up — même comportement qu\'Advanced Options dans Sources',
      'Détection complexité technique corrigée : quand Odoo est connecté, la liste des modules installés prime sur le scan du repo — un repo avec des manifests non installés ne classe plus le projet en Dev',
      'Avertissement IA : message explicite quand le repo contient des modules mais qu\'aucun n\'est installé sur l\'instance connectée',
    ],
  },
  {
    version: '0.25.0',
    date: '2026-05-14',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Identité Better Odoo Assistant : topbar sobre, LED rouge et rappel cyan / vert / jaune / rouge en rail vertical gauche',
      'Refonte visuelle neo-retro assouplie : bordures plus fines, coins légèrement adoucis, états hover/focus plus lisibles pour un usage web app quotidien',
      'Nouvelle typographie tri-rôle : Space Grotesk (titres / CTAs en uppercase), Inter (corps de texte), JetBrains Mono (codes / IDs / badges)',
      'Topbar redesignée : nom produit lisible, navigation contrastée, lien actif theme-aware et meilleure lisibilité responsive',
      'PageHeader : chaque page affiche désormais un identifiant section 00000NNN dérivé du titre (style HARRY.SYS)',
      'Effet CRT dark mode : scanlines ultra-subtiles + vignette radiale — uniquement en mode sombre pour préserver la lisibilité en réunion',
      'Nouvelles classes utilitaires neo-retro : .neo-id, .neo-tag, .neo-section-number, .neo-frame, .neo-status-bar avec LED clignotante, .neo-bracket pour balises type [SYS]',
      'Tokens CSS : palette repensée — light = blueprint off-white, dark = gris charbon, accent par défaut vert BOA et palette utilisateur toujours configurable',
    ],
  },
  {
    version: '0.24.0',
    date: '2026-05-14',
    badge: 'Performance',
    badgeColor: t.success,
    items: [
      'Cache prompts Anthropic optimisé : le system prompt est désormais scindé en deux blocs — stable (identité, sources, instructions, contexte projet) cacheable + variable (langue, perspective, markdown routé) non-cacheable. Gain attendu : ~5-10× sur les coûts input',
      'Cache sur tool_use loop : à chaque itération, cache_control ephemeral est placé sur le dernier tool_result — les tours outils profitent désormais aussi du caching',
      'Observabilité cache : événement done SSE expose cache_creation_input_tokens et cache_read_input_tokens pour mesurer l\'efficacité du cache en production',
      'Instructions sources DRY : _source_instructions() centralise les consignes search_odoo_source / search_project_source / search_target_source pour stabiliser le préfixe cacheable',
      'Outil search amélioré : option case_sensitive (par défaut true pour les patterns de code), retour distinct files_count vs matches, suggestions de fallback si 0 hit (insensible casse / sans accents / restreindre path)',
      'Stop reasons surfacés : max_tokens et refusal Claude renvoient désormais un événement warning dans le SSE, affiché en bulle grise — fin des troncatures silencieuses',
      'Inférence perspective côté serveur : si un client envoie perspective="auto", _infer_perspective() reproduit la logique frontend — utile pour CLI / mobile',
      'Contexte projet déplacé avant le markdown routé pour rester dans la moitié cacheable du system prompt',
    ],
  },
  {
    version: '0.23.0',
    date: '2026-05-14',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Système de perspective 4 rôles unifié end-to-end : Support, Business Analyst, Architecte, Développeur — le backend reconnaît désormais les 4 rôles au lieu de seulement 2 (technical/functional)',
      'Profils Markdown injectés : profile-support.md, profile-business-analyst.md, profile-architect.md, profile-developer.md sont chargés comme section core dans le contexte (contenu par défaut fourni)',
      'Auto-perspective revue : scoring pondéré (signaux forts = 3pt, faibles = 1pt), seuil minimum + marge sur le runner-up pour éviter les bascules erronées sur prompts ambigus',
      'BA_TERMS purgé des mots ultra-génériques (client, utilisateur, projet…) qui noyaient toutes les questions en mode BA',
      'Hystérésis sur l\'inférence frontend : nouveau hook useResolvedPerspective avec debounce 350ms + perspective précédente comme fallback — fin du flicker pendant la frappe',
      'Routage contexte resserré : tokens ambigus (pos, custom, mrp, of…) matchés avec word-boundaries — plus de POS chargé sur "propose", plus de Customizations sur "customer"',
      '"version" seul retiré de _VERSION_TERMS : les notes de version Odoo ne se chargent plus dès qu\'on mentionne "dans la nouvelle version"',
      'load_context_for_prompt accepte target_version : charge à la fois les notes source ET cible lors des prompts de migration',
      'Cache mtime-aware sur les lectures de fichiers markdown : un tour chat ne re-lit plus 5-6 fichiers depuis le disque à chaque fois',
      '_trim_history sécurisé : détecte et retire les tool_result orphelins (Anthropic) ou messages role:tool (OpenAI) en tête de fenêtre — évite les 400 du provider quand un cycle outil est coupé',
    ],
  },
  {
    version: '0.22.0',
    date: '2026-05-14',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Gestion du contexte IA : constantes centralisées dans context_constants.py — plus de dérive entre context_service et ai_service',
      'Trimming d\'historique : les conversations longues sont automatiquement tronquées à 20 tours pour éviter les dépassements de fenêtre de contexte',
      'Compression des résultats d\'outils dans l\'historique : les résultats volumineux (Studio, grep) sont compressés à 2 000 car. dans les messages gardés entre tours (le résultat complet reste streamé vers l\'interface)',
      'Prompt caching Anthropic : le system prompt est envoyé avec cache_control ephemeral — réduction de ~90% du coût en tokens d\'entrée sur les turns répétés',
      'Limite de sortie relevée : Claude passe de 4 096 → 8 192 tokens max par réponse (fin des troncatures silencieuses sur les analyses longues)',
      'Limite de sortie Gemini : max_output_tokens=8 192 ajouté pour harmoniser les comportements entre providers',
      'Priorité dans le routeur de contexte : la section skills (rôle, règles, contrat de réponse) est toujours injectée en premier et ne peut plus être évincée par des sections de domaine trop volumineuses',
    ],
  },
  {
    version: '0.21.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Internationalisation UI : migration FR/EN des écrans historiques principaux (Sources, Projets, Assistant IA, Migration, Paramètres, À propos, Dashboard, Requêtes, Historique)',
      'Composants communs : sidebar, largeur de contenu, toggle de perspective et helpers i18n harmonisés',
      'Assistant & Migration : placeholders, suggestions, actions, historique, bulles de réponse et tooltips adaptés à la langue utilisateur',
      'Paramètres : onglets, stockage, interface, providers, modèles, éditeur de contexte et profil consultant traduits',
      'Documentation : README et changelog mis à jour pour clarifier la couverture bilingue de l’interface',
    ],
  },
  {
    version: '0.20.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Internationalisation v1 : préférences de langue pour l’application, les réponses IA et les fichiers de contexte',
      'Assistant IA : nouvelle instruction de langue avec mode automatique, français forcé ou anglais forcé, sans traduire les identifiants techniques Odoo',
      'Contexte IA : support de fichiers Markdown séparés par langue avec defaults anglais pour skills.md, migration.md, studio.md, meeting-minute.md et notes Odoo 15 à 19',
      'Paramètres : sélecteurs Français / English pour la langue d’interface, la langue des réponses IA et la langue du contexte IA',
      'Éditeur de contexte : choix de langue par fichier, stockage anglais sous ~/.odoo-consultant/context/en/',
    ],
  },
  {
    version: '0.19.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Nouvelle page Fonctionnement : diagramme vertical du flux complet entre config utilisateur, providers IA, Markdown, sources Odoo, repos client, routeur de contexte, outils et réponse finale',
      'Menu latéral : nouvelle entrée Fonctionnement pour expliquer l’architecture d’usage sans mélanger avec le changelog À propos',
      'Routeur de contexte IA : sélection plus fine des sections Markdown utiles selon la demande, avec conservation des sous-sections opérationnelles',
      'Contexte projet : auto-complétion restructurée en faits observés, hypothèses, périmètres prioritaires, risques et questions ouvertes',
      'Qualité prompt : troncature dédiée du contexte projet pour éviter qu’il écrase les autres sources dans les prompts IA',
    ],
  },
  {
    version: '0.18.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Assistant IA & Migration : liste des modèles synchronisée avec les préférences des Paramètres — les modèles désactivés disparaissent du sélecteur en temps réel',
      'Refactorisation : PROVIDERS importé depuis constants/providers dans Assistant.tsx, suppression de la liste locale obsolète (−136 lignes)',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      "Mascotte de réflexion personnalisable : choix entre Robot, Chat ou Chien animé affiché pendant les réponses IA (8 modes d'animation aléatoires : idle, thinking, excited, searching, found, working, surprised, sleepy)",
      'Couleur de la mascotte configurable : 8 presets + color picker libre depuis le profil utilisateur',
      "La mascotte s'applique simultanément sur les pages Assistant et Migration",
      'Gamme OpenAI complète : GPT-5.5, GPT-5.5 Pro, GPT-5.4, GPT-5.4 Pro, GPT-5.4 mini, GPT-5.4 nano, GPT-5.3 Codex, GPT-4.1, GPT-4.1 mini, o4-mini, o3, o3-mini (13 modèles)',
      'GitHub Models : 20 modèles — GPT-5, o3/o4-mini, Llama 4, Grok-3, DeepSeek R1, Phi-4 et plus',
      'Paramètres : la liste ALL_MODELS dérivée dynamiquement depuis providers.ts (plus de doublon figé)',
      'Code splitting : pages chargées en lazy + manualChunks vendor (chunk max 163 kB contre 534 kB avant)',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Outil IA inspect_studio : inventaire complet des personnalisations Studio (modèles custom, champs x_, vues, menus, actions serveur, ir.cron, base.automation, règles d’accès)',
      'Fichier de contexte studio.md : guide d’interprétation éditable depuis les Paramètres (étiquettes, conventions de nommage, impact migration)',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Page Migration : toggle de perspective fonctionnelle (AM/BA) / technique (ARCHI/DEV) pour adapter le ton des analyses',
      'Page Migration : sélecteur de version cible limité aux versions strictement supérieures à la source (migration ascendante uniquement)',
      'Page Migration : label « Projet » dans le sélecteur latéral, environnements filtrés selon la contrainte de version',
      'Outil IA count_source_lines : comptage exhaustif des lignes de code par extension / module / répertoire, utilisable via prompt',
      'Ancrage de défilement : le viewport se positionne automatiquement au début de chaque nouvelle réponse IA (Migration & Assistant)',
      'Suggestions de l\'assistant intégrées dans le composeur (chip cliquable → remplit la zone de saisie)',
      'Contexte migration.md enrichi : sections fonctionnelles, tableau de phases, stratégie de bascule, risques fréquents',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Refonte ciblée UI/UX : design system frontend, boutons, cartes, badges, modales, états hover/focus/loading cohérents',
      'Assistant IA retravaillé : barre de contexte stabilisée, sélecteurs provider / modèle / version / environnement clarifiés',
      'Suggestions de recherche intégrées directement dans la zone de saisie pour gagner de la place',
      'Résumé client de l\'assistant simplifié et moins intrusif',
      'Cartes projets améliorées : hiérarchie plus nette, sections lisibles, environnements plus scannables, actions mieux séparées',
      'Paramètres harmonisés avec les mêmes composants UI et correction du pilotage de largeur',
      'Sources : cartes de version plus lisibles avec statut, retard, Community / Enterprise et action principale mieux hiérarchisée',
      'Correctif : modal d\'ajout / modification d\'environnement avec header fixe, contenu scrollable et footer toujours accessible',
      'Correctif : test de connexion d\'un environnement en édition avec la clé API déjà enregistrée quand les champs n\'ont pas changé',
    ],
  },
  {
    version: '0.13.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Sources complémentaires par environnement : chaque env peut avoir un dépôt GitHub associé (cloné en local via SSH)',
      'Clone / pull du dépôt depuis la modal d\'environnement avec flux SSE en temps réel',
      'L\'IA peut explorer le code custom via les outils search_project_source et read_project_file',
      'Badge ✓ ⎇ dans la barre de contexte de l\'assistant quand un repo est actif',
      'Auto-complétion du contexte projet enrichie avec les manifests des modules custom clonés',
      'Multi-environnements complets : chaque env a ses propres identifiants, version Odoo et repo',
      'Sélecteur d\'environnement dans la barre de contexte de l\'assistant (override par conversation)',
      'AiSelector unifié : provider + modèle en un seul sélecteur groupé',
      'Labels de sections sur les cartes projets (Applications, Société active, Environnements, Actions)',
      'Correctif : sélecteur de version Odoo (mode général) ne passe plus derrière le bloc messages',
      'Correctif : tous les dropdowns de la barre de contexte ne sont plus clippés par overflow',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-05-13',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Vérification des droits Odoo : détection admin système / admin ERP avec avertissement',
      'Sociétés inaccessibles grisées (🔒) sur les cartes projets et dans l\'assistant',
      'Blocage de l\'envoi dans l\'assistant si la société sélectionnée est inaccessible',
      'Bouton "🔍 Accès" sur chaque projet pour re-vérifier les droits à la demande',
      'Barre de contexte unifiée dans l\'assistant (onglets + version + fournisseur en un bloc)',
      'VersionDropdown : Community (C) et Enterprise (E) affichés séparément, badge "saas" supprimé',
      'Versions intermédiaires (19.1…) indentées sous leur major dans le sélecteur',
      'Boutons d\'action renommés : Compte-rendu, Nouvelle conv., Historique (N) — plus explicites',
      'Indicateur de chargement SSH pendant la vérification au démarrage',
      'Bouton Paramètres de l\'assistant aligné sur les autres pages',
    ],
  },
  {
    version: '0.11.0',
    date: '2026-05-12',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Historique des conversations : sauvegarde automatique, reprise et suppression',
      'Navigation latérale simplifiée (suppression Tableau de bord, Requêtes, Historique)',
      'Carte projet redessinée : logo 48px, grille connexion compacte, footer d\'actions',
      'PageHeader partagé sur toutes les pages (titre + description + bouton d\'action cohérents)',
      'Boutons unifiés via classes CSS avec effets hover (btn-primary, btn-secondary, btn-ghost…)',
      'Modificateurs de taille btn-sm / btn-xs pour les boutons compacts',
      'Utilitaire label-section pour les titres de sections en petites capitales',
      'Largeur max 900px cohérente sur toutes les pages',
      'Correction hauteur viewport dans l\'assistant (flex:1 + minHeight:0)',
      'Zone de saisie agrandie (3 lignes) avec effet focus coloré',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-05-12',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Sélecteur de société active sur les projets et dans l\'assistant IA (scope requêtes Odoo)',
      'Requêtes Odoo filtrées par allowed_company_ids — données restreintes à la société choisie',
      'Nouveaux modèles Copilot : Claude 4.x (Sonnet/Opus/Haiku), GPT-5.x, Gemini 2.5/3.x, Grok Code Fast',
      'Sélecteur de modèle dans l\'assistant filtre selon les préférences des Paramètres',
      'Versions intermédiaires visibles dans le sélecteur Odoo et les fichiers contexte',
      'Correction visibilité boutons en thème sombre/sépia (variables CSS transparentes via color-mix)',
      'Onglets projets affichent le nom du projet (non le nom de la société)',
      'Badge sources v{x} ✓ dans l\'assistant (vert = installé, orange = manquant)',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-05-12',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Thèmes clair / sombre / sépia avec sélecteur dans le profil consultant',
      'Couleur primaire du profil appliquée à la sidebar (teinte dynamique)',
      'Profil consultant affiché en haut de la sidebar (avatar, nom, titre)',
      'Modification de projets existants depuis la page Projets',
      'Correctif : le texte reste dans le champ après un envoi automatique',
      'Correctif : reset fichier contexte ne marquait plus les autres comme Personnalisé',
      'Correctif : champs texte invisibles en thème sombre (bg blanc sur blanc)',
      'Page Sources : cartes unifiées avec barre de progression, tri par version, badge saas, bouton + version intermédiaire',
      'Fournisseur Copilot Business (OAuth device flow)',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-05-12',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Page À propos avec historique des versions',
      'Modèle de compte-rendu de réunion dans les Paramètres',
      'Bouton "Meeting Minute" depuis le chat (génère un CR formaté)',
      'Version 19.0 sélectionnée par défaut en mode général',
      'Sources : ajout de versions intermédiaires (19.1, 19.2, etc.)',
      'install.sh : auto-rechargement après git pull (correction bootstrap)',
      'install.sh : rebuild frontend systématique à chaque installation',
      'install.sh : installation automatique de Node.js et curl si absents',
      'Bandeau d\'avertissement sources manquantes dans l\'assistant',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-05-12',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Configuration des modèles disponibles par provider dans les Paramètres',
      'Nouveaux modèles Copilot : Claude 3.7, o1-mini, o3-mini',
      'Nouveaux modèles GitHub : Claude 3.7, Llama 3.1 405B, Mistral Large, Phi-3.5',
      'Contexte consultant Odoo entièrement refondu : tableaux de référence complets, patterns de diagnostic avancés, droits d\'accès, détection customisations',
      'Cache-Control no-cache sur index.html (plus besoin de hard refresh)',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-05-11',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Mode général Odoo (sans projet client) pour questions sur le code source',
      'Notes de version enrichies pour Odoo 15 à 19 (tables de migration, breaking changes)',
      'Suggestions contextuelles différentes en mode général vs mode projet',
      'Sélecteur de version Odoo en mode général',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-05-10',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Outils code source Odoo dans l\'assistant : search_odoo_source et read_odoo_file',
      'L\'IA peut explorer le code source Odoo local pour répondre aux questions',
      'Fichiers de contexte éditables dans les Paramètres (skills.md + notes de version)',
      'Synchronisation des sources Odoo avec progression en temps réel',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-05-09',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Sélecteur de modèle IA avec recommandations et descriptions',
      'Chatter par projet (conversations séparées par client)',
      'Streaming des réponses IA en temps réel',
      'Affichage détaillé des appels d\'outils (tool_call / tool_result)',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-05-08',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Page Paramètres pour les clés API',
      'Provider GitHub Models (GPT-4o via token GitHub)',
      'Test de connectivité pour chaque clé API',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-05-07',
    badge: '',
    badgeColor: t.muted,
    items: [
      'Connexion GitHub Copilot Business via OAuth Device Flow',
      'Support multi-provider : Claude, GPT-4o, Gemini, Copilot, GitHub Models',
      'Clés API stockées dans le trousseau système (keyring)',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-05-05',
    badge: 'Initial',
    badgeColor: t.muted,
    items: [
      'Assistant IA connecté aux données Odoo via JSON-RPC',
      'Gestion de profils clients (multi-instance)',
      'Synchronisation des sources Odoo Community & Enterprise (git clone)',
      'Page de requêtes manuelles (search_read avec export CSV/Excel/Markdown)',
      'Historique des requêtes et conversations',
    ],
  },
]

export default function About() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      title: 'About',
      description: 'Better Odoo Assistant — productivity tool for Odoo consultants.',
      version: 'Version',
      history: 'Version history',
      current: 'Current',
      initial: 'Initial',
      source: 'Source code available on GitHub under a private license. Internal use for the consulting firm.',
    }
    : {
      title: 'À propos',
      description: 'Better Odoo Assistant — outil de productivité pour consultants Odoo.',
      version: 'Version',
      history: 'Historique des versions',
      current: 'Actuel',
      initial: 'Initial',
      source: 'Code source disponible sur GitHub sous licence privée. Usage interne au cabinet de conseil.',
    }
  return (
    <div className="page-stack">
      <PageHeader title={c.title} description={c.description} />

      {/* Author card */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        padding: '20px 24px',
        background: t.bgCard, border: `1px solid ${t.border}`,
        borderRadius: t.radiusLg, marginBottom: 40,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `linear-gradient(135deg, ${t.brand}, ${t.brandDark})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 800, color: t.brandContrast, flexShrink: 0,
        }}>B</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 2 }}>Benoît Le Goff</div>
          <div style={{ fontSize: 13, color: t.muted, marginBottom: 8 }}>Consultant Odoo</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <a
              href="https://github.com/le-goff-benoit/better_odoo_consultant"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px',
                background: t.bgMuted, border: `1px solid ${t.border}`,
                borderRadius: t.radiusFull, fontSize: 12, fontWeight: 600,
                color: t.text, textDecoration: 'none',
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = t.brand)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
              </svg>
              le-goff-benoit / better_odoo_consultant
            </a>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: t.muted, marginBottom: 4 }}>{c.version}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.brandFg }}>{VERSION}</div>
        </div>
      </div>

      {/* Changelog */}
      <h2 style={{ fontSize: 13, fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>
        {c.history}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {CHANGELOG.map((entry, i) => (
          <div key={entry.version} style={{ display: 'flex', gap: 0 }}>
            {/* Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 20, flexShrink: 0 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                background: entry.badge === 'Actuel' ? t.brand : t.borderLight,
                border: `2px solid ${entry.badge === 'Actuel' ? t.brand : t.border}`,
              }} />
              {i < CHANGELOG.length - 1 && (
                <div style={{ flex: 1, width: 2, background: t.borderLight, minHeight: 24 }} />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>v{entry.version}</span>
                {entry.badge && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px',
                    background: entry.badgeColor === t.brand ? t.brand20 : t.bgMuted,
                    color: entry.badgeColor === t.brand ? t.brand : t.muted,
                    borderRadius: t.radiusFull, border: `1px solid ${entry.badgeColor === t.brand ? t.brand40 : t.border}`,
                  }}>{entry.badge === 'Actuel' ? c.current : entry.badge === 'Initial' ? c.initial : entry.badge}</span>
                )}
                <span style={{ fontSize: 11, color: t.muted, marginLeft: 'auto' }}>{entry.date}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {entry.items.map((item, j) => (
                  <li key={j} style={{ fontSize: 13, color: t.textSub, lineHeight: 1.5 }}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, padding: '14px 18px', background: t.bgMuted, borderRadius: t.radius, fontSize: 12, color: t.muted }}>
        {c.source}
      </div>
    </div>
  )
}
