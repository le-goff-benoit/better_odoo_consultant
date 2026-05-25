/**
 * Comment ça marche — v0.96.x rewrite.
 *
 * Goal: tell the story of what happens between the moment the user hits
 * Enter and the moment they read the answer. Six scrollable sections
 * follow the actual runtime path:
 *
 *   1. Pipeline    — single-screen overview of the seven-stage pipeline.
 *   2. Contexte    — the project context (profile, env, locale, company)
 *                    pinned at the top of the system prompt.
 *   3. Agents      — the four response personas + handoff graph.
 *   4. Skills      — the ~37 skills grouped by data source.
 *   5. Dispatcher  — five-tier scoring + semantic fallback + pruning.
 *   6. Live        — SSE events streamed back + post-response chips.
 *
 * No Mermaid: every diagram is plain React + CSS (+ inline SVG when arrows
 * make the relationship clearer). Bilingual via the existing
 * ``useUiLanguage`` hook.
 */
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Bot, BrainCircuit, Briefcase, Building2, CheckCircle2, Code2,
  Compass, FileText, Gauge, GitBranch, Layers, ListTree, MessageSquarePlus,
  Network, Radar, ScanLine, ShieldCheck, Sparkles, Target, Workflow, Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { useUiLanguage } from '../i18n'
import { t } from '../theme'

// ── Section IDs (used by the TOC + pipeline hero clicks) ──────────
const SECTIONS = ['pipeline', 'contexte', 'agents', 'skills', 'dispatcher', 'live'] as const
type SectionId = (typeof SECTIONS)[number]

// ── Bilingual copy ────────────────────────────────────────────────
const copy = {
  fr: {
    title: 'Comment ça marche',
    description:
      "De ton prompt à la réponse : architecture multi-agents, dispatcher de skills, contexte engineering et observabilité — sans rien envoyer ailleurs que vers le provider IA que tu choisis.",
    tocTitle: 'Sommaire',
    toc: {
      pipeline: "Vue d'ensemble",
      contexte: 'Contexte projet',
      agents: 'Agents',
      skills: 'Skills',
      dispatcher: 'Dispatcher',
      live: 'Live & observabilité',
    },
    pipeline: {
      title: '1 · Le pipeline en une vue',
      lead:
        "À chaque tour, sept étapes se succèdent côté local — toutes traçables, toutes désactivables individuellement. Le seul aller-retour réseau est l'appel au provider IA.",
      stages: [
        { icon: BrainCircuit, label: 'Prompt', sub: 'utilisateur' },
        { icon: Compass, label: 'Agent', sub: 'inférence ou explicite' },
        { icon: Radar, label: 'Dispatcher', sub: 'scoring skills' },
        { icon: Layers, label: 'Contexte', sub: 'assemblage borné' },
        { icon: Wrench, label: 'Tools', sub: 'expositions LLM' },
        { icon: Sparkles, label: 'LLM', sub: 'provider externe' },
        { icon: Network, label: 'SSE', sub: 'événements + chips' },
      ],
      footnote:
        "Clique sur une étape pour aller à sa section. Les étapes 1 à 5 et 7 tournent sur ta machine ; seule l'étape 6 part vers ton provider IA.",
    },
    contexte: {
      title: '2 · Contexte projet — le différenciateur métier',
      lead:
        "Un LLM générique connaît Odoo en surface. Pour répondre comme un consultant, il a besoin de savoir précisément quelle base, quelle version, quel pays, quelle société et quel cadre projet. Tout cela est épinglé en tête de prompt, dans la zone stable cachée — jamais tronqué par la pression budgétaire.",
      pinnedTitle: 'Zone stable (épinglée, jamais tronquée)',
      pinnedItems: [
        { icon: Briefcase, label: 'Profil', body: 'URL · base · login · accès XML-RPC' },
        { icon: GitBranch, label: 'Environnement actif', body: 'prod / staging / test — chacun peut être sur une version Odoo différente' },
        { icon: Building2, label: 'Société active', body: 'nom + filtre company_id appliqué aux requêtes' },
        { icon: Target, label: 'Version Odoo', body: "lue depuis l'env actif, pas le profil principal — corrige les drift silencieux" },
        { icon: ShieldCheck, label: 'Pays fiscal', body: 'CH / FR / BE / DE… — épinglé directement, plus de dépendance au routed budget' },
        { icon: FileText, label: 'project_context.md', body: 'mémo libre du consultant (architecture, contraintes, décisions)' },
      ],
      routedTitle: 'Zone routée (sélectionnée selon le prompt)',
      routedItems: [
        { icon: ListTree, label: 'Playbooks skills', body: 'instructions opérationnelles des skills routés (cf. §5)' },
        { icon: FileText, label: 'Références auto-loadées', body: 'docs longues attachées à un skill, déclenchées par mots-clés' },
        { icon: ScanLine, label: 'Localisation fiscale', body: 'l10n_<cc>.md détaillé quand la demande devient comptable' },
        { icon: Gauge, label: 'Complexité technique', body: 'profil PME / mid-market / studio_dev / dev' },
        { icon: Network, label: 'Release notes Odoo', body: 'changements de version pertinents pour la demande' },
      ],
      tail:
        "Tout est borné à ~36 000 caractères. Si ça déborde, ce sont les blocs routés qui sont compressés en priorité — jamais le bloc stable. La zone variable (langue, perspective, contexte routé) suit le cache breakpoint du provider pour économiser les tokens d'entrée.",
    },
    agents: {
      title: '3 · Les agents — quatre personas de réponse',
      lead:
        "Chaque agent est un dossier autonome sous agents/<slug>/ : AGENT.md (frontmatter YAML + corps Markdown FR/EN), AGENT.en.md, migration.md optionnel, eval_queries.json. Sélection en trois modes : explicite (« comme un architecte »), inférée (scoring weak/strong sur les 2 derniers tours), ou bascule via chip suggérée par drift detection.",
      list: [
        { slug: 'support', label: 'Support / Run', color: '#3b82f6', icon: Wrench, motto: 'Diagnostic rapide, workaround, fix durable', preferred: ['triage_odoo_error', 'odoo_query_records', 'odoo_inspect_fields'], for: 'Key user bloqué, équipe N1/N2, oncall, incident production' },
        { slug: 'business_analyst', label: 'Analyste métier', color: '#10b981', icon: Briefcase, motto: 'Cadrage processus, paramétrage standard, parcours utilisateur', preferred: ['triage_odoo_error', 'odoo_inspect_navigation', 'odoo_inspect_studio'], for: 'Consultant fonctionnel, key user, sponsor métier, application manager' },
        { slug: 'architect', label: 'Architecte', color: '#a855f7', icon: Building2, motto: 'Trade-offs structurants, scalabilité, stratégie de migration', preferred: ['compare_odoo_versions', 'inspect_module_graph', 'odoo_inspect_security'], for: 'Architecte, tech lead, CTO, sponsor technique' },
        { slug: 'developer', label: 'Développeur', color: '#f59e0b', icon: Code2, motto: 'Implémentation, debug, refactor, tests', preferred: ['source_search_odoo', 'source_read_odoo_file', 'repo_search_code'], for: 'Développeur Odoo, intégrateur, tech lead code-first' },
      ],
      handoffTitle: 'Handoff entre agents',
      handoffLead:
        "Chaque agent déclare dans son frontmatter ses cibles de handoff possibles. Deux chemins de bascule : (a) chip « Avis complémentaire » sous chaque réponse pour enrichir sans changer l'agent ; (b) chip « Bascule » proposée quand la conversation dérive vers un autre rôle pendant 2 tours consécutifs (SSE agent_drift).",
      handoffFooter:
        'Aucun handoff silencieux côté serveur : la bascule reste toujours opt-in via clic utilisateur, préservant la prévisibilité.',
      sampleTitle: "Extrait d'AGENT.md (architect)",
      sampleAgentMd: `---
name: architect
label: Architecte
icon: Building2
color: "#a855f7"
default: false
agent_type: response_agent
handoff:
  can_handoff_to: [developer, business_analyst]
auto_keywords:
  strong: [architecture, adr, multi-société, "stratégie de migration"]
preferred_skills:
  - compare_odoo_versions
  - inspect_module_graph
---

# Architect — rôle, ton, limites, format de restitution
…`,
    },
    skills: {
      title: '4 · Les skills — environ 37, organisés par source',
      lead:
        "Chaque skill vit dans un dossier self-contained sous skills/<slug>/ : SKILL.md (frontmatter + playbook), diagram/, references/ (auto-loadables ou lazy), examples/, scripts/handler.py, eval_queries.json. Ajouter un skill = créer un dossier, aucun code à modifier.",
      families: [
        { prefix: 'odoo-*', label: 'XML-RPC sur instance Odoo live', color: '#be185d',
          examples: [
            ['odoo_count_records', 'Compter (search_count) sur un domaine'],
            ['odoo_query_records', 'Lire (search_read) borné à 5000 lignes'],
            ['odoo_aggregate_records', 'Read_group pour KPI / GROUP BY'],
            ['odoo_inspect_fields', 'Définition champs (type, relations, attrs)'],
            ['odoo_inspect_view', 'Vue arch + XML résolu, vue par défaut'],
            ['odoo_inspect_navigation', 'Menu → action → modèle + groups'],
            ['odoo_inspect_studio', 'Customisations Studio en place'],
            ['odoo_inspect_security', 'ir.rule + ir.model.access + groups'],
            ['odoo_inspect_report', 'Modèle rapport + template QWeb'],
            ['odoo_inspect_modules', 'État des modules installés / dispo'],
          ] as const },
        { prefix: 'source-*', label: 'Code source Odoo standard sur disque', color: '#4338ca',
          examples: [
            ['source_search_odoo', 'Grep sur Odoo Community + Enterprise'],
            ['source_read_odoo_file', 'Lire un fichier par chemin'],
            ['source_show_commit', 'git show <sha> + deepen au besoin'],
          ] as const },
        { prefix: 'repo-*', label: 'Dépôt custom client', color: '#b45309',
          examples: [
            ['repo_search_code', 'Grep dans le repo client cloné'],
            ['repo_read_file', 'Lire un fichier du repo client'],
            ['repo_list_modules', 'Inventaire des modules custom'],
            ['repo_count_source_lines', 'Volumétrie code custom'],
          ] as const },
        { prefix: 'migration-*', label: 'Sources version cible (mode migration)', color: '#0369a1',
          examples: [
            ['migration_search_target_source', 'Grep sur la version cible'],
            ['migration_read_target_file', 'Lire un fichier version cible'],
          ] as const },
        { prefix: 'runtime-*', label: 'Orchestrateurs internes (allow_implicit_invocation=false)', color: '#6d28d9',
          examples: [
            ['runtime_context_aggregator', 'Assemble le system prompt'],
            ['runtime_skill_dispatcher', 'Score + sélectionne les skills'],
            ['runtime_perspective_router', "Sélectionne l'agent de réponse"],
            ['runtime_localization_detector', 'Détecte société active + l10n'],
            ['runtime_complexity_analyzer', 'Niveau technique de la base'],
            ['runtime_release_notes_injector', 'Notes de version pertinentes'],
            ['runtime_attachment_handler', 'PDF / images attachés au prompt'],
          ] as const },
        { prefix: 'analyses transverses', label: 'Lecture multi-sources ou rendu out-of-band', color: '#047857',
          examples: [
            ['triage_odoo_error', 'Classe un traceback (migration/studio/data/custom/source)'],
            ['compare_odoo_versions', 'Diff statique modèle / vue / module entre versions'],
            ['inspect_module_graph', 'Dépendances manifest + héritages modèles'],
            ['inspect_automations', 'Audit ir.cron / base.automation / mail.template'],
            ['inspect_financial_reports', 'account.report Enterprise (P&L, bilan, TVA)'],
            ['inspect_spreadsheet', 'Spreadsheet Odoo, dashboards, formules ODOO.*'],
            ['generate_diagram', 'Diagramme Mermaid flow / class / module graph'],
            ['output_report_writer', 'Rendu livrable formaté (revue, plan, mémo)'],
          ] as const },
        { prefix: 'routing-* / agent-*', label: "Méta-skills d'observabilité", color: '#92400e',
          examples: [
            ['routing_explain', 'Pourquoi tel skill a été choisi (candidats scorés)'],
            ['routing_self_audit', 'Bilan qualité routage (reformulations, confiance)'],
            ['agent_handoff_propose', "Propose une bascule d'agent vers un rôle aval"],
          ] as const },
      ],
      sampleTitle: 'Extrait de SKILL.md (odoo_count_records)',
      sampleSkillMd: `---
name: odoo_count_records
group: live
modes: [assistant, migration, creator]
keywords: [combien, count, nombre, volume, total, périmètre]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-count-records/scripts/handler.py
---

## Quand l'utiliser
- "Combien", volume, risque de masse, périmètre de migration.
…`,
    },
    dispatcher: {
      title: '5 · Le dispatcher — comment les skills sont routés',
      lead:
        "100 % déterministe sur la base lexicale, complété par un fallback sémantique TF-IDF en pur Python quand aucun signal lexical ne porte. Chaque candidat reçoit un score sur l'échelle ci-dessous, puis le pruning contextuel élimine les fausses pistes avant injection.",
      bands: [
        { score: 100, name: 'Nom de skill explicite', sub: "L'utilisateur a nommé le skill", tone: 'high' as const },
        { score: 90, name: 'Pattern fort (SHA, ACL, P&L…)', sub: 'Regex multi-termes spécifique', tone: 'high' as const },
        { score: 75, name: 'Pattern domaine (navigation, KPI)', sub: 'Combinaison de termes typés', tone: 'high' as const },
        { score: 60, name: 'Keyword du SKILL.md', sub: 'Mot-clé déclaré dans le frontmatter', tone: 'medium' as const },
        { score: 50, name: 'Semantic fallback', sub: 'TF-IDF cosine ≥ 0.12 (uniquement si aucun lexical ≥ 60)', tone: 'medium' as const },
        { score: 40, name: 'Intent bundle', sub: '18 paquets curated (live_data, kpi, studio…)', tone: 'medium' as const },
        { score: 25, name: 'Mode default', sub: 'creator-default / migration-default', tone: 'low' as const },
      ],
      thresholdNote: "Seuil minimum _MIN_SKILL_SCORE = 25 — sous ce score, le candidat est gardé pour l'observabilité mais pas injecté.",
      modifiersTitle: 'Modificateurs par agent',
      modifiersBody:
        "Chaque agent peut booster +20 ses preferred_skills (uniquement si déjà ≥ 25, pour rescue) ou pénaliser −20 ses avoided_skills (jamais sur une invocation explicite). Les denied_skills sont retirés purement et simplement de la toolset exposée au LLM pour ce tour.",
      pruningTitle: 'Pruning contextuel',
      pruningBody:
        "Environ 15 règles pruned:*-focus éliminent les fuites bundle entre familles : par exemple, si l'utilisateur demande explicitement « combien », query_records est retiré au profit de count_records ; si la demande est clairement navigation, les skills sœurs sans signal propre sont écartés.",
      confidenceTitle: 'Niveau de confiance émis (SSE routing_confidence)',
      confidence: [
        { lvl: 'high', body: 'Top score ≥ 80 (explicit / pattern fort). Routage à suivre tel quel.', color: '#16a34a' },
        { lvl: 'medium', body: 'Top score 40–79 (keyword / intent / semantic). Pertinent, sans certitude.', color: '#ca8a04' },
        { lvl: 'low', body: "Top score < 40. Une chip de clarification peut s'afficher côté UI.", color: '#dc2626' },
      ],
    },
    live: {
      title: '6 · Côté UI — événements SSE et post-réponse',
      lead:
        "Le frontend écoute un flux Server-Sent Events. Chaque étape technique est observable : tu vois ce que l'IA fait, dans quel ordre, avec quelles données.",
      events: [
        { name: 'orchestration_selected', when: 'Au début', body: "Mode d'orchestration retenu (single agent ou sequential_agents)." },
        { name: 'agent_selected', when: 'Au début', body: 'Perspective résolue + raison (explicite, inférée, fallback).' },
        { name: 'skills_selected', when: 'Au début', body: "Liste des skills injectés + candidats scorés (cliquer la pastille « N skills » dans l'UI)." },
        { name: 'routing_confidence', when: 'Au début', body: 'Niveau global du routage (high / medium / low).' },
        { name: 'agent_drift', when: 'Au début', body: "Suggestion de bascule d'agent quand un autre rôle ressort 2 tours de suite (opt-in)." },
        { name: 'tool_call', when: 'Pendant', body: 'Le LLM appelle un outil — nom + arguments visibles.' },
        { name: 'tool_result', when: 'Pendant', body: 'Le backend exécute et renvoie le résultat compressé.' },
        { name: 'text', when: 'En continu', body: 'Le texte de la réponse, streamé token par token.' },
        { name: 'done', when: 'À la fin', body: 'Compteurs tokens (input, output, cache read, cache create).' },
      ],
      chipsTitle: 'Bandes de chips sous la réponse',
      chips: [
        { icon: CheckCircle2, label: "Propositions d'action", body: 'Extraites du Markdown (listes « Actions » / « Todo »). Click → relance un prompt qui exécute cette action précise.' },
        { icon: MessageSquarePlus, label: 'Avis complémentaire', body: 'Un agent alternatif (filtré par handoff_can_handoff_to) relance la conversation avec la réponse précédente en contexte. Enrichit sans réécrire.' },
      ],
      tail:
        "Tout ce qui passe par le dispatcher est aussi loggé localement dans ~/.odoo-consultant/routing-feedback.jsonl (rotation 5000 lignes). Le skill routing_self_audit lit ce log et produit un bilan agrégé sur demande. Rien ne quitte ta machine — uniquement l'appel provider que tu as choisi.",
    },
  },
  en: {
    title: 'How it works',
    description:
      'From your prompt to the answer: multi-agent architecture, skill dispatcher, context engineering and observability — without sending anything anywhere except to the AI provider you picked.',
    tocTitle: 'Contents',
    toc: { pipeline: 'Overview', contexte: 'Project context', agents: 'Agents', skills: 'Skills', dispatcher: 'Dispatcher', live: 'Live & observability' },
    pipeline: {
      title: '1 · The pipeline at a glance',
      lead:
        'Each turn goes through seven local stages — all traceable, all individually disablable. The only network round trip is the call to the AI provider.',
      stages: [
        { icon: BrainCircuit, label: 'Prompt', sub: 'user input' },
        { icon: Compass, label: 'Agent', sub: 'inferred or explicit' },
        { icon: Radar, label: 'Dispatcher', sub: 'skill scoring' },
        { icon: Layers, label: 'Context', sub: 'bounded assembly' },
        { icon: Wrench, label: 'Tools', sub: 'exposed to LLM' },
        { icon: Sparkles, label: 'LLM', sub: 'external provider' },
        { icon: Network, label: 'SSE', sub: 'events + chips' },
      ],
      footnote: 'Click a stage to jump to its section. Stages 1–5 and 7 run on your machine; only stage 6 leaves it.',
    },
    contexte: {
      title: '2 · Project context — the business differentiator',
      lead:
        "A generic LLM knows Odoo at the surface. To answer like a consultant, it needs to know exactly which database, which version, which country, which company and which project frame. All of that is pinned at the top of the system prompt, in the cached stable zone — never trimmed under budget pressure.",
      pinnedTitle: 'Stable zone (pinned, never trimmed)',
      pinnedItems: [
        { icon: Briefcase, label: 'Profile', body: 'URL · DB · login · XML-RPC access' },
        { icon: GitBranch, label: 'Active environment', body: 'prod / staging / test — each may run a different Odoo version' },
        { icon: Building2, label: 'Active company', body: 'name + company_id filter applied to queries' },
        { icon: Target, label: 'Odoo version', body: "read from the active env, not the profile's primary — fixes silent drift" },
        { icon: ShieldCheck, label: 'Fiscal country', body: 'CH / FR / BE / DE… — pinned directly, no more routed-budget dependency' },
        { icon: FileText, label: 'project_context.md', body: "consultant's free-form memo (architecture, constraints, decisions)" },
      ],
      routedTitle: 'Routed zone (selected from the prompt)',
      routedItems: [
        { icon: ListTree, label: 'Skill playbooks', body: 'operational instructions of routed skills (see §5)' },
        { icon: FileText, label: 'Auto-loaded references', body: 'long docs attached to a skill, triggered by keywords' },
        { icon: ScanLine, label: 'Fiscal localization', body: 'detailed l10n_<cc>.md when the request turns accounting' },
        { icon: Gauge, label: 'Technical complexity', body: 'profile SMB / mid-market / studio_dev / dev' },
        { icon: Network, label: 'Odoo release notes', body: 'version changes relevant to the request' },
      ],
      tail:
        "Everything is bounded to ~36,000 chars. On overflow, routed blocks are compressed first — the stable block is never touched. The variable zone (language, perspective, routed context) sits after the provider's cache breakpoint to save input tokens.",
    },
    agents: {
      title: '3 · Agents — four response personas',
      lead:
        "Each agent is a standalone folder under agents/<slug>/: AGENT.md (YAML frontmatter + FR/EN Markdown body), AGENT.en.md, optional migration.md, eval_queries.json. Three selection modes: explicit (“as an architect”), inferred (weak/strong scoring on the last 2 turns), or switch via a chip suggested by drift detection.",
      list: [
        { slug: 'support', label: 'Support / Run', color: '#3b82f6', icon: Wrench, motto: 'Fast diagnosis, workaround, durable fix', preferred: ['triage_odoo_error', 'odoo_query_records', 'odoo_inspect_fields'], for: 'Blocked key user, L1/L2 support, oncall, production incident' },
        { slug: 'business_analyst', label: 'Business Analyst', color: '#10b981', icon: Briefcase, motto: 'Process framing, standard setup, user journey', preferred: ['triage_odoo_error', 'odoo_inspect_navigation', 'odoo_inspect_studio'], for: 'Functional consultant, key user, business sponsor, application manager' },
        { slug: 'architect', label: 'Architect', color: '#a855f7', icon: Building2, motto: 'Structural trade-offs, scalability, migration strategy', preferred: ['compare_odoo_versions', 'inspect_module_graph', 'odoo_inspect_security'], for: 'Architect, tech lead, CTO, technical sponsor' },
        { slug: 'developer', label: 'Developer', color: '#f59e0b', icon: Code2, motto: 'Implementation, debug, refactor, tests', preferred: ['source_search_odoo', 'source_read_odoo_file', 'repo_search_code'], for: 'Odoo developer, integrator, code-first tech lead' },
      ],
      handoffTitle: 'Inter-agent handoff',
      handoffLead:
        'Each agent declares its possible handoff targets in its frontmatter. Two switch paths: (a) a "Second opinion" chip under each answer enriches without changing the active agent; (b) a "Switch" chip is proposed when the conversation drifts to another role for 2 consecutive turns (SSE agent_drift).',
      handoffFooter:
        'No silent server-side handoff: the switch is always opt-in via a click, preserving predictability.',
      sampleTitle: 'AGENT.md excerpt (architect)',
      sampleAgentMd: `---
name: architect
label: Architect
icon: Building2
color: "#a855f7"
default: false
agent_type: response_agent
handoff:
  can_handoff_to: [developer, business_analyst]
auto_keywords:
  strong: [architecture, adr, multi-company, "migration strategy"]
preferred_skills:
  - compare_odoo_versions
  - inspect_module_graph
---

# Architect — role, tone, limits, response format
…`,
    },
    skills: {
      title: '4 · Skills — about 37, organised by data source',
      lead:
        "Each skill lives in a self-contained folder under skills/<slug>/: SKILL.md (frontmatter + playbook), diagram/, references/ (auto-loadable or lazy), examples/, scripts/handler.py, eval_queries.json. Add a new skill = create a folder, no code edit needed.",
      families: [
        { prefix: 'odoo-*', label: 'Live Odoo XML-RPC', color: '#be185d',
          examples: [
            ['odoo_count_records', 'Count (search_count) on a domain'],
            ['odoo_query_records', 'Read (search_read) bounded to 5000 rows'],
            ['odoo_aggregate_records', 'read_group for KPIs / GROUP BY'],
            ['odoo_inspect_fields', 'Field metadata (type, relations, attrs)'],
            ['odoo_inspect_view', 'View arch + resolved XML, default view'],
            ['odoo_inspect_navigation', 'Menu → action → model + groups'],
            ['odoo_inspect_studio', 'Studio customisations in place'],
            ['odoo_inspect_security', 'ir.rule + ir.model.access + groups'],
            ['odoo_inspect_report', 'Report model + QWeb template'],
            ['odoo_inspect_modules', 'Installed / available module state'],
          ] as const },
        { prefix: 'source-*', label: 'Standard Odoo source on disk', color: '#4338ca',
          examples: [
            ['source_search_odoo', 'Grep across Community + Enterprise'],
            ['source_read_odoo_file', 'Read a file by path'],
            ['source_show_commit', 'git show <sha> with deepen on demand'],
          ] as const },
        { prefix: 'repo-*', label: 'Custom client repository', color: '#b45309',
          examples: [
            ['repo_search_code', 'Grep the cloned client repo'],
            ['repo_read_file', 'Read a file from the client repo'],
            ['repo_list_modules', 'Custom-module inventory'],
            ['repo_count_source_lines', 'Custom-code volumetry'],
          ] as const },
        { prefix: 'migration-*', label: 'Target-version sources (migration mode)', color: '#0369a1',
          examples: [
            ['migration_search_target_source', 'Grep on the target version'],
            ['migration_read_target_file', 'Read a target-version file'],
          ] as const },
        { prefix: 'runtime-*', label: 'Internal orchestrators (allow_implicit_invocation=false)', color: '#6d28d9',
          examples: [
            ['runtime_context_aggregator', 'Assembles the system prompt'],
            ['runtime_skill_dispatcher', 'Scores + selects skills'],
            ['runtime_perspective_router', 'Picks the response agent'],
            ['runtime_localization_detector', 'Detects active company + l10n'],
            ['runtime_complexity_analyzer', 'Technical level of the base'],
            ['runtime_release_notes_injector', 'Relevant version notes'],
            ['runtime_attachment_handler', 'PDF / images attached to the prompt'],
          ] as const },
        { prefix: 'cross-cutting analyses', label: 'Multi-source read or out-of-band rendering', color: '#047857',
          examples: [
            ['triage_odoo_error', 'Classify a traceback (migration/studio/data/custom/source)'],
            ['compare_odoo_versions', 'Static diff of model / view / module across versions'],
            ['inspect_module_graph', 'Manifest dependencies + model inheritance'],
            ['inspect_automations', 'Audit ir.cron / base.automation / mail.template'],
            ['inspect_financial_reports', 'Enterprise account.report (P&L, balance, VAT)'],
            ['inspect_spreadsheet', 'Odoo Spreadsheet, dashboards, ODOO.* formulas'],
            ['generate_diagram', 'Mermaid flow / class / module-graph diagram'],
            ['output_report_writer', 'Formatted deliverable rendering (review, plan, memo)'],
          ] as const },
        { prefix: 'routing-* / agent-*', label: 'Observability meta-skills', color: '#92400e',
          examples: [
            ['routing_explain', 'Why this skill was picked (scored candidates)'],
            ['routing_self_audit', 'Routing quality digest (reformulations, confidence)'],
            ['agent_handoff_propose', 'Suggest a handoff to a downstream agent'],
          ] as const },
      ],
      sampleTitle: 'SKILL.md excerpt (odoo_count_records)',
      sampleSkillMd: `---
name: odoo_count_records
group: live
modes: [assistant, migration, creator]
keywords: [how many, count, total, volume, scope]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-count-records/scripts/handler.py
---

## When to use
- "How many", volume, mass-impact risk, migration scope.
…`,
    },
    dispatcher: {
      title: '5 · The dispatcher — how skills get routed',
      lead:
        "100 % deterministic on the lexical side, complemented by a pure-Python TF-IDF semantic fallback when no lexical signal catches. Each candidate gets a score on the ladder below, then contextual pruning removes false positives before injection.",
      bands: [
        { score: 100, name: 'Explicit skill name', sub: 'The user named the skill', tone: 'high' as const },
        { score: 90, name: 'Strong pattern (SHA, ACL, P&L…)', sub: 'Specific multi-term regex', tone: 'high' as const },
        { score: 75, name: 'Domain pattern (navigation, KPI)', sub: 'Combination of typed terms', tone: 'high' as const },
        { score: 60, name: 'Keyword from SKILL.md', sub: 'Keyword declared in the frontmatter', tone: 'medium' as const },
        { score: 50, name: 'Semantic fallback', sub: 'TF-IDF cosine ≥ 0.12 (only if no lexical ≥ 60)', tone: 'medium' as const },
        { score: 40, name: 'Intent bundle', sub: '18 curated packs (live_data, kpi, studio…)', tone: 'medium' as const },
        { score: 25, name: 'Mode default', sub: 'creator-default / migration-default', tone: 'low' as const },
      ],
      thresholdNote: 'Minimum threshold _MIN_SKILL_SCORE = 25 — below this score the candidate is kept for observability but not injected.',
      modifiersTitle: 'Per-agent modifiers',
      modifiersBody:
        "Each agent can boost its preferred_skills by +20 (only if already ≥ 25, as a rescue) or penalise its avoided_skills by −20 (never on an explicit invocation). denied_skills are removed outright from the toolset exposed to the LLM for the turn.",
      pruningTitle: 'Contextual pruning',
      pruningBody:
        'Around 15 pruned:*-focus rules cut bundle leakage between families: e.g. if the user explicitly asks "how many", query_records is dropped in favour of count_records; if the request is clearly navigation, sibling skills without their own signal are removed.',
      confidenceTitle: 'Emitted confidence level (SSE routing_confidence)',
      confidence: [
        { lvl: 'high', body: 'Top score ≥ 80 (explicit / strong pattern). Trust the routing.', color: '#16a34a' },
        { lvl: 'medium', body: 'Top score 40–79 (keyword / intent / semantic). Relevant, not certain.', color: '#ca8a04' },
        { lvl: 'low', body: 'Top score < 40. A clarification chip may appear in the UI.', color: '#dc2626' },
      ],
    },
    live: {
      title: '6 · UI side — SSE events and post-response',
      lead:
        "The frontend listens to a Server-Sent Events stream. Every technical stage is observable: you see what the AI does, in what order, with what data.",
      events: [
        { name: 'orchestration_selected', when: 'Start', body: 'Orchestration mode picked (single agent or sequential_agents).' },
        { name: 'agent_selected', when: 'Start', body: 'Resolved perspective + reason (explicit, inferred, fallback).' },
        { name: 'skills_selected', when: 'Start', body: 'List of injected skills + scored candidates (click the "N skills" badge in the UI).' },
        { name: 'routing_confidence', when: 'Start', body: 'Overall routing level (high / medium / low).' },
        { name: 'agent_drift', when: 'Start', body: 'Suggestion to switch agent when another role surfaces 2 turns in a row (opt-in).' },
        { name: 'tool_call', when: 'During', body: 'The LLM calls a tool — name + arguments visible.' },
        { name: 'tool_result', when: 'During', body: 'The backend runs it and returns the compressed result.' },
        { name: 'text', when: 'Streaming', body: 'The answer text, streamed token by token.' },
        { name: 'done', when: 'End', body: 'Token counters (input, output, cache read, cache create).' },
      ],
      chipsTitle: 'Chip strips below the answer',
      chips: [
        { icon: CheckCircle2, label: 'Action proposals', body: 'Extracted from Markdown ("Actions" / "Todo" lists). Click → fires a prompt that runs that specific action.' },
        { icon: MessageSquarePlus, label: 'Second opinion', body: 'An alternate agent (filtered by handoff_can_handoff_to) reopens the conversation with the previous answer as context. Enriches without rewriting.' },
      ],
      tail:
        "Everything that flows through the dispatcher is also logged locally in ~/.odoo-consultant/routing-feedback.jsonl (5000-line rotation). The routing_self_audit skill reads this log and produces an aggregated digest on demand. Nothing leaves your machine — only the provider call you picked.",
    },
  },
} as const

// ─────────────────────────────────────────────────────────────────
// Reusable section header
// ─────────────────────────────────────────────────────────────────
function SectionHeader({ id, title, lead }: { id: SectionId; title: string; lead: string }) {
  return (
    <div id={id} style={{ scrollMarginTop: 80, marginBottom: 16 }}>
      <h2 style={{ fontFamily: t.fontDisplay, fontSize: 26, fontWeight: 700, color: t.text, margin: '0 0 8px' }}>
        {title}
      </h2>
      <p style={{ color: t.textSub, lineHeight: 1.6, maxWidth: 920, margin: 0 }}>{lead}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section 1 — PipelineHero
// ─────────────────────────────────────────────────────────────────
type Stage = { icon: LucideIcon; label: string; sub: string }

function PipelineHero({ stages, onJump }: { stages: readonly Stage[]; onJump: (id: SectionId) => void }) {
  // Map each stage index to the section it documents.
  const targets: SectionId[] = ['pipeline', 'agents', 'dispatcher', 'contexte', 'skills', 'live', 'live']
  const externalAt = 5 // LLM stage = the only network hop
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`, gap: 0,
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
      padding: 18, overflowX: 'auto',
    }}>
      {stages.map((s, i) => {
        const Icon = s.icon
        const isExternal = i === externalAt
        return (
          <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
            <button
              type="button"
              onClick={() => onJump(targets[i])}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '10px 6px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: t.text, textAlign: 'center',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: isExternal ? t.warningBg : t.brand10,
                color: isExternal ? t.warningSolid : t.brandFg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${isExternal ? t.warningSolid : t.brand}`,
              }}>
                <Icon size={20} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2 }}>{s.label}</div>
              <div style={{ fontSize: 10, color: t.muted, lineHeight: 1.3 }}>{s.sub}</div>
              {isExternal && (
                <div style={{
                  marginTop: 2, fontSize: 9, fontWeight: 700, padding: '2px 6px',
                  background: t.warningBg, color: t.warningSolid, borderRadius: t.radiusFull,
                  textTransform: 'uppercase', letterSpacing: 0.4,
                }}>
                  Network
                </div>
              )}
            </button>
            {i < stages.length - 1 && (
              <div style={{
                position: 'absolute', right: -8, top: '34%',
                width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: t.muted, pointerEvents: 'none',
              }}>
                <ArrowRight size={14} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section 2 — ContextStack (two-column pinned vs routed)
// ─────────────────────────────────────────────────────────────────
type CtxItem = { icon: LucideIcon; label: string; body: string }

function ContextStack({
  pinnedTitle, pinnedItems, routedTitle, routedItems, tail,
}: {
  pinnedTitle: string; pinnedItems: readonly CtxItem[]
  routedTitle: string; routedItems: readonly CtxItem[]
  tail: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
      <ContextColumn
        title={pinnedTitle}
        items={pinnedItems}
        accent={t.successSolid}
        accentBg={t.successBg}
        badge="STABLE · CACHED"
      />
      <ContextColumn
        title={routedTitle}
        items={routedItems}
        accent={t.infoSolid}
        accentBg={t.infoBg}
        badge="ROUTED · PER TURN"
      />
      <p style={{ gridColumn: '1 / -1', color: t.textSub, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        {tail}
      </p>
    </div>
  )
}

function ContextColumn({
  title, items, accent, accentBg, badge,
}: {
  title: string; items: readonly CtxItem[]
  accent: string; accentBg: string; badge: string
}) {
  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
      padding: 18, position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 12, right: 12, fontSize: 9, fontWeight: 700,
        padding: '3px 8px', background: accentBg, color: accent, borderRadius: t.radiusFull,
        letterSpacing: 0.6,
      }}>
        {badge}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: t.text, paddingRight: 130 }}>
        {title}
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => {
          const Icon = it.icon
          return (
            <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 30, height: 30, flexShrink: 0, borderRadius: t.radiusSm,
                background: accentBg, color: accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={15} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{it.label}</div>
                <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.5 }}>{it.body}</div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section 3 — Agents grid + Handoff graph
// ─────────────────────────────────────────────────────────────────
type AgentEntry = {
  slug: string; label: string; color: string; icon: LucideIcon
  motto: string; preferred: readonly string[]; for: string
}

function AgentsGrid({ agents }: { agents: readonly AgentEntry[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
      {agents.map(a => {
        const Icon = a.icon
        return (
          <div key={a.slug} style={{
            background: t.bgCard, border: `1px solid ${t.border}`, borderTop: `3px solid ${a.color}`,
            borderRadius: t.radiusLg, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: `${a.color}22`,
                color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={18} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{a.label}</div>
                <code style={{ fontSize: 10, color: t.muted, fontFamily: t.fontMono }}>{a.slug}</code>
              </div>
            </div>
            <div style={{ fontSize: 12, color: t.textSub, fontStyle: 'italic', lineHeight: 1.5 }}>
              « {a.motto} »
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                Pour
              </div>
              <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>{a.for}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                Preferred skills
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {a.preferred.map(s => (
                  <code key={s} style={{
                    fontSize: 10, fontFamily: t.fontMono, padding: '2px 6px',
                    background: t.bgMuted, color: t.textSub, borderRadius: t.radiusSm,
                  }}>{s}</code>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HandoffGraph({ agents }: { agents: readonly AgentEntry[] }) {
  // 4 nodes positioned around a diamond. Targets per agent mirror
  // handoff.can_handoff_to declared in each AGENT.md.
  const handoff: Record<string, string[]> = {
    support: ['business_analyst', 'developer', 'architect'],
    business_analyst: ['support', 'architect', 'developer'],
    architect: ['developer', 'business_analyst', 'support'],
    developer: ['architect', 'business_analyst', 'support'],
  }
  const positions: Record<string, { x: number; y: number }> = {
    support:          { x: 60,  y: 160 },
    business_analyst: { x: 180, y: 30  },
    architect:        { x: 300, y: 160 },
    developer:        { x: 180, y: 290 },
  }
  const arrows: Array<{ from: string; to: string }> = []
  for (const [from, targets] of Object.entries(handoff)) {
    for (const to of targets) arrows.push({ from, to })
  }

  function endpoint(from: string, to: string): { x1: number; y1: number; x2: number; y2: number } {
    const a = positions[from]
    const b = positions[to]
    const dx = b.x - a.x, dy = b.y - a.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const r = 36
    return {
      x1: a.x + (dx / len) * r,
      y1: a.y + (dy / len) * r,
      x2: b.x - (dx / len) * r,
      y2: b.y - (dy / len) * r,
    }
  }

  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
      padding: 16, display: 'flex', justifyContent: 'center',
    }}>
      <svg viewBox="0 0 360 320" width="100%" style={{ maxWidth: 480, height: 'auto' }} aria-hidden>
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={t.muted} />
          </marker>
        </defs>
        {arrows.map((a, i) => {
          const { x1, y1, x2, y2 } = endpoint(a.from, a.to)
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={t.muted} strokeOpacity={0.45} strokeWidth={1.5}
              markerEnd="url(#arrowhead)" />
          )
        })}
        {agents.map(a => {
          const p = positions[a.slug]
          if (!p) return null
          return (
            <g key={a.slug}>
              <circle cx={p.x} cy={p.y} r={30} fill={t.bgCard} stroke={a.color} strokeWidth={2.5} />
              <text x={p.x} y={p.y - 2} textAnchor="middle" fontSize={11} fontWeight={700} fill={t.text} fontFamily={t.fontDisplay}>
                {a.label.split(' ')[0]}
              </text>
              <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize={9} fill={t.muted} fontFamily={t.fontMono}>
                {a.slug}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section 4 — Skills families
// ─────────────────────────────────────────────────────────────────
type SkillFamily = { prefix: string; label: string; color: string; examples: readonly (readonly [string, string])[] }

function SkillFamilies({ families }: { families: readonly SkillFamily[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {families.map(f => (
        <div key={f.prefix} style={{
          background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
          padding: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <code style={{
              fontFamily: t.fontMono, fontSize: 12, fontWeight: 700, padding: '4px 10px',
              background: `${f.color}18`, color: f.color, borderRadius: t.radiusSm,
              border: `1px solid ${f.color}40`,
            }}>{f.prefix}</code>
            <span style={{ fontSize: 13, color: t.textSub }}>{f.label}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 6 }}>
            {f.examples.map(([name, desc]) => (
              <div key={name} style={{
                display: 'flex', gap: 10, padding: '6px 0', borderBottom: `1px dashed ${t.borderLight}`,
              }}>
                <code style={{
                  fontFamily: t.fontMono, fontSize: 11, color: t.text, fontWeight: 600,
                  minWidth: 220, flexShrink: 0,
                }}>{name}</code>
                <span style={{ fontSize: 12, color: t.muted, lineHeight: 1.5 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section 5 — Scoring stack
// ─────────────────────────────────────────────────────────────────
type Band = { score: number; name: string; sub: string; tone: 'high' | 'medium' | 'low' }

function ScoringStack({ bands, thresholdNote }: { bands: readonly Band[]; thresholdNote: string }) {
  const toneColor = (tone: Band['tone']): { bg: string; border: string; fg: string } => {
    if (tone === 'high') return { bg: t.successBg, border: t.successSolid, fg: t.successSolid }
    if (tone === 'medium') return { bg: t.warningBg, border: t.warningSolid, fg: t.warningSolid }
    return { bg: t.bgMuted, border: t.muted, fg: t.muted }
  }
  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
      padding: 20,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bands.map(b => {
          const c = toneColor(b.tone)
          return (
            <div key={b.score} style={{
              display: 'grid', gridTemplateColumns: '60px 1fr', gap: 14, alignItems: 'center',
            }}>
              <div style={{
                fontSize: 22, fontWeight: 800, color: c.fg, fontFamily: t.fontDisplay,
                textAlign: 'right',
              }}>
                {b.score}
              </div>
              <div style={{
                padding: '10px 14px', borderRadius: t.radius,
                background: c.bg, borderLeft: `4px solid ${c.border}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{b.name}</div>
                <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{b.sub}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{
        marginTop: 14, padding: '8px 12px', background: t.bgMuted, borderRadius: t.radius,
        fontSize: 11, color: t.textSub, lineHeight: 1.5,
      }}>
        <code style={{ fontFamily: t.fontMono, fontSize: 11, color: t.text }}>↓</code>{' '}
        {thresholdNote}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Confidence badges (3 levels)
// ─────────────────────────────────────────────────────────────────
function ConfidenceBadges({ items }: { items: ReadonlyArray<{ lvl: string; body: string; color: string }> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      {items.map(it => (
        <div key={it.lvl} style={{
          padding: 14, background: t.bgCard, border: `1px solid ${t.border}`,
          borderLeft: `4px solid ${it.color}`, borderRadius: t.radius,
        }}>
          <div style={{
            display: 'inline-block', padding: '2px 8px', background: `${it.color}22`,
            color: it.color, fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
            borderRadius: t.radiusFull, textTransform: 'uppercase', marginBottom: 6,
          }}>
            {it.lvl}
          </div>
          <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>{it.body}</div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section 6 — SSE timeline
// ─────────────────────────────────────────────────────────────────
type EventDef = { name: string; when: string; body: string }

function SseTimeline({ events }: { events: readonly EventDef[] }) {
  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
      padding: 18,
    }}>
      <div style={{ position: 'relative', paddingLeft: 22 }}>
        <div style={{
          position: 'absolute', left: 6, top: 8, bottom: 8, width: 2,
          background: t.borderLight, borderRadius: 2,
        }} />
        {events.map((e, i) => (
          <div key={e.name} style={{
            position: 'relative', paddingBottom: i === events.length - 1 ? 0 : 14,
          }}>
            <div style={{
              position: 'absolute', left: -22, top: 4, width: 14, height: 14, borderRadius: '50%',
              background: t.bgCard, border: `2px solid ${t.brand}`,
            }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <code style={{
                fontFamily: t.fontMono, fontSize: 12, fontWeight: 700, color: t.text,
                background: t.bgMuted, padding: '2px 8px', borderRadius: t.radiusSm,
              }}>
                {e.name}
              </code>
              <span style={{
                fontSize: 10, fontWeight: 600, color: t.muted, textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}>
                {e.when}
              </span>
            </div>
            <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5, marginTop: 4 }}>{e.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Code excerpt (used twice: AGENT.md + SKILL.md)
// ─────────────────────────────────────────────────────────────────
function CodeExcerpt({ title, code }: { title: string; code: string }) {
  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
      padding: 16,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase',
        letterSpacing: 0.6, marginBottom: 8,
      }}>
        {title}
      </div>
      <pre style={{
        margin: 0, padding: 12, background: t.bgMuted, borderRadius: t.radiusSm,
        fontFamily: t.fontMono, fontSize: 11, color: t.text, lineHeight: 1.55,
        overflowX: 'auto', whiteSpace: 'pre',
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TOC (sticky)
// ─────────────────────────────────────────────────────────────────
function TableOfContents({ title, labels, activeId, onJump, compact }: {
  title: string
  labels: Record<SectionId, string>
  activeId: SectionId
  onJump: (id: SectionId) => void
  compact: boolean
}) {
  return (
    <nav style={{
      position: compact ? 'static' : 'sticky', top: 8, background: t.bgCard, border: `1px solid ${t.border}`,
      borderRadius: t.radius, padding: 10, alignSelf: 'start', overflowX: compact ? 'auto' : 'visible',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: t.muted, textTransform: 'uppercase',
        letterSpacing: 0.6, marginBottom: 8, padding: '0 4px',
      }}>
        {title}
      </div>
      <ul style={{
        listStyle: 'none', margin: 0, padding: 0, display: 'flex',
        flexDirection: compact ? 'row' : 'column', gap: compact ? 6 : 2,
        minWidth: compact ? 'max-content' : undefined,
      }}>
        {SECTIONS.map(s => {
          const active = activeId === s
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onJump(s)}
                style={{
                  width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: t.radiusSm,
                  background: active ? t.brand10 : 'transparent',
                  color: active ? t.brandFg : t.textSub,
                  border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: active ? 600 : 500,
                  transition: 'background .15s',
                }}
              >
                {labels[s]}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────
export default function HowItWorks() {
  const lang = useUiLanguage()
  const c = copy[lang]
  const [activeId, setActiveId] = useState<SectionId>('pipeline')
  const [compactToc, setCompactToc] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false
  ))

  useEffect(() => {
    const observers: IntersectionObserver[] = []
    SECTIONS.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      const obs = new IntersectionObserver(
        entries => {
          for (const e of entries) {
            if (e.isIntersecting) setActiveId(id)
          }
        },
        { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => { observers.forEach(o => o.disconnect()) }
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 860px)')
    const update = () => setCompactToc(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  function jump(id: SectionId) {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const layout: CSSProperties = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: compactToc ? 'minmax(0, 1fr)' : '180px minmax(0, 1fr)',
    gap: compactToc ? 16 : 24,
    maxWidth: 1200,
    margin: '0 auto',
    padding: compactToc ? '8px 0 64px' : '8px 4px 80px',
  }), [compactToc])

  return (
    <div>
      <PageHeader title={c.title} description={c.description} />

      <div style={layout}>
        <TableOfContents
          title={c.tocTitle}
          labels={c.toc}
          activeId={activeId}
          onJump={jump}
          compact={compactToc}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          {/* Section 1 — Pipeline */}
          <section>
            <SectionHeader id="pipeline" title={c.pipeline.title} lead={c.pipeline.lead} />
            <PipelineHero stages={c.pipeline.stages} onJump={jump} />
            <p style={{ marginTop: 10, fontSize: 12, color: t.muted, lineHeight: 1.5 }}>
              {c.pipeline.footnote}
            </p>
          </section>

          {/* Section 2 — Contexte projet */}
          <section>
            <SectionHeader id="contexte" title={c.contexte.title} lead={c.contexte.lead} />
            <ContextStack
              pinnedTitle={c.contexte.pinnedTitle}
              pinnedItems={c.contexte.pinnedItems}
              routedTitle={c.contexte.routedTitle}
              routedItems={c.contexte.routedItems}
              tail={c.contexte.tail}
            />
          </section>

          {/* Section 3 — Agents */}
          <section>
            <SectionHeader id="agents" title={c.agents.title} lead={c.agents.lead} />
            <AgentsGrid agents={c.agents.list} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: t.text, margin: '24px 0 8px' }}>
              {c.agents.handoffTitle}
            </h3>
            <p style={{ fontSize: 13, color: t.textSub, lineHeight: 1.6, margin: '0 0 14px', maxWidth: 920 }}>
              {c.agents.handoffLead}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              <HandoffGraph agents={c.agents.list} />
              <CodeExcerpt title={c.agents.sampleTitle} code={c.agents.sampleAgentMd} />
            </div>
            <p style={{ marginTop: 12, fontSize: 12, color: t.muted, lineHeight: 1.5 }}>
              {c.agents.handoffFooter}
            </p>
          </section>

          {/* Section 4 — Skills */}
          <section>
            <SectionHeader id="skills" title={c.skills.title} lead={c.skills.lead} />
            <SkillFamilies families={c.skills.families} />
            <div style={{ marginTop: 16 }}>
              <CodeExcerpt title={c.skills.sampleTitle} code={c.skills.sampleSkillMd} />
            </div>
          </section>

          {/* Section 5 — Dispatcher */}
          <section>
            <SectionHeader id="dispatcher" title={c.dispatcher.title} lead={c.dispatcher.lead} />
            <ScoringStack bands={c.dispatcher.bands} thresholdNote={c.dispatcher.thresholdNote} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginTop: 16 }}>
              <ModifierBlock title={c.dispatcher.modifiersTitle} body={c.dispatcher.modifiersBody} icon={Workflow} />
              <ModifierBlock title={c.dispatcher.pruningTitle} body={c.dispatcher.pruningBody} icon={Bot} />
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, color: t.text, margin: '24px 0 12px' }}>
              {c.dispatcher.confidenceTitle}
            </h3>
            <ConfidenceBadges items={c.dispatcher.confidence} />
          </section>

          {/* Section 6 — Live */}
          <section>
            <SectionHeader id="live" title={c.live.title} lead={c.live.lead} />
            <SseTimeline events={c.live.events} />

            <h3 style={{ fontSize: 16, fontWeight: 700, color: t.text, margin: '24px 0 12px' }}>
              {c.live.chipsTitle}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              {c.live.chips.map(ch => {
                const Icon = ch.icon
                return (
                  <div key={ch.label} style={{
                    background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
                    padding: 16, display: 'flex', gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, flexShrink: 0, borderRadius: '50%',
                      background: t.brand10, color: t.brandFg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{ch.label}</div>
                      <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5, marginTop: 2 }}>
                        {ch.body}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <p style={{
              marginTop: 16, padding: 14, fontSize: 13, color: t.textSub, lineHeight: 1.6,
              background: t.brand10, borderLeft: `3px solid ${t.brand}`, borderRadius: t.radius,
            }}>
              {c.live.tail}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

function ModifierBlock({ title, body, icon }: { title: string; body: string; icon: LucideIcon }) {
  const Icon = icon
  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: t.radiusSm,
          background: t.bgMuted, color: t.textSub,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} />
        </div>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>{title}</h3>
      </div>
      <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.6 }}>{body}</div>
    </div>
  )
}
