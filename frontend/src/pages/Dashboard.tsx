import { useQuery } from '@tanstack/react-query'
import { health, listProfiles, listProjects } from '../api/client'
import { Link } from 'react-router-dom'
import { t } from '../theme'

export default function Dashboard() {
  const { data: h } = useQuery({ queryKey: ['health'], queryFn: health })
  const { data: profilesRes } = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const { data: projectsRes } = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  const online = h?.data?.status === 'ok'
  const profiles = profilesRes?.data?.length ?? 0
  const projects = projectsRes?.data?.length ?? 0

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 4 }}>Tableau de bord</h1>
        <p style={{ fontSize: 14, color: t.muted }}>Bienvenue dans votre portail Odoo Consultant.</p>
      </div>

      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard
          label="Statut API"
          value={online ? 'En ligne' : 'Hors ligne'}
          icon="⚡"
          color={online ? t.success : t.danger}
        />
        <StatCard label="Projets configurés" value={String(profiles)} icon="🏢" color={t.brand} />
        <StatCard label="Dépôts locaux" value={String(projects)} icon="📁" color={t.action} />
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 14 }}>Actions rapides</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <QuickAction to="/profiles" icon="🏢" title="Ajouter un projet" desc="Connectez une instance Odoo.sh" />
          <QuickAction to="/sources" icon="⬇" title="Télécharger Odoo" desc="Sources Community ou Enterprise" />
          <QuickAction to="/query" icon="🔍" title="Requêter Odoo" desc="Lire des données en direct" />
          <QuickAction to="/projects" icon="📁" title="Gérer un dépôt" desc="Cloner ou mettre à jour" />
        </div>
      </div>

      {/* Getting started */}
      {profiles === 0 && (
        <div style={{
          background: t.white, border: `1px solid ${t.border}`,
          borderLeft: `4px solid ${t.brand}`, borderRadius: t.radius,
          padding: '16px 20px', fontSize: 13,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: t.text }}>Par où commencer ?</div>
          <ol style={{ paddingLeft: 18, color: t.muted, lineHeight: 2 }}>
            <li>Allez dans <Link to="/sources" style={{ color: t.action }}>Sources</Link> pour télécharger Odoo en local</li>
            <li>Allez dans <Link to="/profiles" style={{ color: t.action }}>Mes projets</Link> pour connecter une instance Odoo</li>
            <li>Utilisez <Link to="/query" style={{ color: t.action }}>Requêtes</Link> pour explorer les données</li>
          </ol>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div style={{
      background: t.white, border: `1px solid ${t.border}`,
      borderRadius: t.radiusLg, padding: '18px 20px',
      boxShadow: t.shadow, display: 'flex', gap: 14, alignItems: 'center',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: t.radius, fontSize: 20,
        background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}

function QuickAction({ to, icon, title, desc }: { to: string; icon: string; title: string; desc: string }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div style={{
        background: t.white, border: `1px solid ${t.border}`,
        borderRadius: t.radiusLg, padding: '16px 18px',
        boxShadow: t.shadow, cursor: 'pointer',
        transition: 'border-color .15s, box-shadow .15s',
        display: 'flex', gap: 12, alignItems: 'center',
      }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: t.text }}>{title}</div>
          <div style={{ fontSize: 12, color: t.muted }}>{desc}</div>
        </div>
      </div>
    </Link>
  )
}
