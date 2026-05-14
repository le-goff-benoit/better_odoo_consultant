import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { health, listProfiles } from '../api/client'
import { t } from '../theme'
import Icon, { IconName } from '../components/Icon'
import { useUiLanguage } from '../i18n'
import PageHeader from '../components/PageHeader'
import { Card } from '../components/ui'

const copy = {
  fr: {
    title: 'Tableau de bord',
    welcome: 'Bienvenue dans votre portail Odoo Consultant.',
    apiStatus: 'Statut API',
    online: 'En ligne',
    offline: 'Hors ligne',
    projects: 'Projets',
    quickActions: 'Actions rapides',
    newProject: 'Nouveau projet',
    newProjectDesc: 'Connecter une instance Odoo',
    downloadOdoo: 'Télécharger Odoo',
    downloadOdooDesc: 'Sources Community / Enterprise',
    queryOdoo: 'Requêter Odoo',
    queryOdooDesc: 'Lire des données en direct',
    start: 'Par où commencer ?',
    stepSources: 'pour télécharger Odoo localement',
    stepProjects: 'pour connecter une instance Odoo client',
    stepQuery: 'pour explorer et exporter les données',
    sources: 'Sources',
    myProjects: 'Mes projets',
    queries: 'Requêtes',
  },
  en: {
    title: 'Dashboard',
    welcome: 'Welcome to your Odoo Consultant portal.',
    apiStatus: 'API status',
    online: 'Online',
    offline: 'Offline',
    projects: 'Projects',
    quickActions: 'Quick actions',
    newProject: 'New project',
    newProjectDesc: 'Connect an Odoo instance',
    downloadOdoo: 'Download Odoo',
    downloadOdooDesc: 'Community / Enterprise sources',
    queryOdoo: 'Query Odoo',
    queryOdooDesc: 'Read live data',
    start: 'Where to start?',
    stepSources: 'to download Odoo locally',
    stepProjects: 'to connect a client Odoo instance',
    stepQuery: 'to explore and export data',
    sources: 'Sources',
    myProjects: 'Projects',
    queries: 'Queries',
  },
}

export default function Dashboard() {
  const lang = useUiLanguage()
  const c = copy[lang]
  const { data: h }        = useQuery({ queryKey: ['health'],   queryFn: health })
  const { data: profRes }  = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })

  const online   = h?.data?.status === 'ok'
  const profiles = profRes?.data?.length ?? 0

  return (
    <div className="page-stack">
      <PageHeader title={c.title} description={c.welcome} />

      {/* Stats row */}
      <div className="dashboard-stats">
        <StatCard
          label={c.apiStatus} value={online ? c.online : c.offline}
          icon="zap" color={online ? t.success : t.danger}
          bg={online ? t.successBg : t.dangerBg}
        />
        <StatCard label={c.projects} value={String(profiles)} icon="building" color={t.brand} bg={t.brandLight} />
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: 12 }}>
        <h2 className="ui-section-title">{c.quickActions}</h2>
        <div className="dashboard-actions">
          <QuickAction to="/profiles" icon="building" title={c.newProject} desc={c.newProjectDesc} />
          <QuickAction to="/sources"  icon="download" title={c.downloadOdoo} desc={c.downloadOdooDesc} />
          <QuickAction to="/query"    icon="search"   title={c.queryOdoo} desc={c.queryOdooDesc} />
        </div>
      </div>

      {/* Getting started */}
      {profiles === 0 && (
        <div className="ui-alert" style={{ marginTop: 28 }}>
          <Icon name="arrowRight" size={18} color={t.brand} />
          <div>
            <div className="ui-alert-title" style={{ marginBottom: 10 }}>
              {c.start}
            </div>
            <ol className="ui-ordered-list">
              <li>
                {lang === 'en' ? 'Go to ' : 'Allez dans '}<Link to="/sources" className="ui-link">{c.sources}</Link> {c.stepSources}
              </li>
              <li>
                {lang === 'en' ? 'Go to ' : 'Allez dans '}<Link to="/profiles" className="ui-link">{c.myProjects}</Link> {c.stepProjects}
              </li>
              <li>
                {lang === 'en' ? 'Use ' : 'Utilisez '}<Link to="/query" className="ui-link">{c.queries}</Link> {c.stepQuery}
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color, bg }: {
  label: string; value: string; icon: IconName; color: string; bg: string
}) {
  return (
    <Card className="dashboard-stat-card">
      <div className="dashboard-stat-icon" style={{ background: bg }}>
        <Icon name={icon} size={18} color={color} />
      </div>
      <div>
        <div className="dashboard-stat-value" style={{ color }}>
          {value}
        </div>
        <div className="dashboard-stat-label">{label}</div>
      </div>
    </Card>
  )
}

function QuickAction({ to, icon, title, desc }: { to: string; icon: IconName; title: string; desc: string }) {
  return (
    <Card interactive>
      <Link to={to} className="dashboard-action-card">
        <div className="dashboard-action-icon">
          <Icon name={icon} size={15} color={t.brand} />
        </div>
        <div>
          <div className="dashboard-action-title">{title}</div>
          <div className="dashboard-action-desc">{desc}</div>
        </div>
        <Icon name="arrowRight" size={13} color="currentColor" className="dashboard-action-arrow" />
      </Link>
    </Card>
  )
}
