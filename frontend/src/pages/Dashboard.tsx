import { useQuery } from '@tanstack/react-query'
import { health, listProfiles, listProjects } from '../api/client'

export default function Dashboard() {
  const { data: h } = useQuery({ queryKey: ['health'], queryFn: health })
  const { data: profiles } = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <Card title="API Status" value={h?.data?.status === 'ok' ? '✓ Online' : '✗ Offline'} />
        <Card title="Profiles" value={profiles?.data?.length ?? '—'} />
        <Card title="Projects" value={projects?.data?.length ?? '—'} />
      </div>
    </div>
  )
}

function Card({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={{ background: '#fff', padding: 20, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.1)' }}>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  )
}
