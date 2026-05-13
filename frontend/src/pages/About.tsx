import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import { APP_VERSION } from '../version'

const VERSION = APP_VERSION

const CHANGELOG = [
  {
    version: '0.16.0',
    date: '2026-05-13',
    badge: 'Actuel',
    badgeColor: t.brand,
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
  return (
    <div className="page-stack">
      <PageHeader title="À propos" description="Odoo Consultant Portal — outil de productivité pour consultants Odoo." />

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
          <div style={{ fontSize: 11, color: t.muted, marginBottom: 4 }}>Version</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.brand }}>{VERSION}</div>
        </div>
      </div>

      {/* Changelog */}
      <h2 style={{ fontSize: 13, fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>
        Historique des versions
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
                  }}>{entry.badge}</span>
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
        Code source disponible sur GitHub sous licence privée. Usage interne au cabinet de conseil.
      </div>
    </div>
  )
}
