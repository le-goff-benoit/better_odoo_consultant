import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import { APP_VERSION } from '../version'
import { useUiLanguage } from '../i18n'

const VERSION = APP_VERSION

const CHANGELOG = [
  {
    version: '0.35.7',
    date: '2026-05-16',
    badge: 'Actuel',
    badgeColor: t.brand,
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
          fontSize: 24, fontWeight: 800, color: '#fff', flexShrink: 0,
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
          <div style={{ fontSize: 20, fontWeight: 800, color: t.brand }}>{VERSION}</div>
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
