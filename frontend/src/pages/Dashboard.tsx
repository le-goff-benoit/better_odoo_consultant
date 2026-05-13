import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { health, listProfiles } from '../api/client'
import { t } from '../theme'
import Icon, { IconName } from '../components/Icon'

export default function Dashboard() {
  const { data: h }        = useQuery({ queryKey: ['health'],   queryFn: health })
  const { data: profRes }  = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })

  const online   = h?.data?.status === 'ok'
  const profiles = profRes?.data?.length ?? 0

  return (
    <div className="page-stack">
      {/* Page title */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: t.text, letterSpacing: '-0.3px' }}>
          Tableau de bord
        </h1>
        <p style={{ color: t.muted, marginTop: 4 }}>
          Bienvenue dans votre portail Odoo Consultant.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 36 }}>
        <StatCard
          label="Statut API" value={online ? 'En ligne' : 'Hors ligne'}
          icon="zap" color={online ? t.success : t.danger}
          bg={online ? t.successBg : t.dangerBg}
        />
        <StatCard label="Projets" value={String(profiles)} icon="building" color={t.brand} bg={t.brandLight} />
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: t.textSub, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Actions rapides
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          <QuickAction to="/profiles" icon="building" title="Nouveau projet"    desc="Connecter une instance Odoo" />
          <QuickAction to="/sources"  icon="download" title="Télécharger Odoo"  desc="Sources Community / Enterprise" />
          <QuickAction to="/query"    icon="search"   title="Requêter Odoo"     desc="Lire des données en direct" />
        </div>
      </div>

      {/* Getting started */}
      {profiles === 0 && (
        <div style={{
          marginTop: 28,
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderLeft: `3px solid ${t.brand}`,
          borderRadius: t.radiusLg,
          padding: '18px 22px',
        }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: t.text, marginBottom: 10 }}>
            Par où commencer ?
          </div>
          <ol style={{ paddingLeft: 18, color: t.muted, lineHeight: 2.2, fontSize: 13 }}>
            <li>
              Allez dans <Link to="/sources" style={{ color: t.brand, fontWeight: 500 }}>Sources</Link> pour télécharger Odoo localement
            </li>
            <li>
              Allez dans <Link to="/profiles" style={{ color: t.brand, fontWeight: 500 }}>Mes projets</Link> pour connecter une instance Odoo client
            </li>
            <li>
              Utilisez <Link to="/query" style={{ color: t.brand, fontWeight: 500 }}>Requêtes</Link> pour explorer et exporter les données
            </li>
          </ol>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color, bg }: {
  label: string; value: string; icon: IconName; color: string; bg: string
}) {
  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`,
      borderRadius: t.radiusLg, padding: '18px 20px',
      boxShadow: t.shadow,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1, letterSpacing: '-0.5px' }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}

function QuickAction({ to, icon, title, desc }: { to: string; icon: IconName; title: string; desc: string }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div style={{
        background: t.bgCard, border: `1px solid ${t.border}`,
        borderRadius: t.radiusLg, padding: '14px 16px',
        boxShadow: t.shadow, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'border-color .15s, box-shadow .15s',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = t.brand
          ;(e.currentTarget as HTMLDivElement).style.boxShadow = t.shadowMd
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = t.border
          ;(e.currentTarget as HTMLDivElement).style.boxShadow = t.shadow
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: t.bgMuted,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name={icon} size={15} color={t.brand} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: t.text }}>{title}</div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 1 }}>{desc}</div>
        </div>
        <Icon name="arrowRight" size={13} color={t.placeholder} style={{ marginLeft: 'auto', flexShrink: 0 }} />
      </div>
    </Link>
  )
}
