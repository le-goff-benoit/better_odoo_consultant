import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { t } from '../theme'
import { useUiLanguage } from '../i18n'
import { PROVIDERS } from '../constants/providers'

// Provider + model picker shared by the Migration and Creator workspaces.
export default function AiSelector({ providers, provider, modelId, switchProvider, setModelId }: {
  providers: Array<typeof PROVIDERS[number]>
  provider: string
  modelId: string
  switchProvider: (id: string) => void
  setModelId: (id: string) => void
}) {
  const lang = useUiLanguage()
  const recommended = lang === 'en' ? 'Recommended' : 'Recommandé'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const currentProv = providers.find(p => p.id === provider)
  const currentModel = currentProv?.models.find(m => m.id === modelId) ?? currentProv?.models[0]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!currentProv) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '5px 12px', borderRadius: t.radius, cursor: 'pointer',
        background: t.bgCard, border: `1px solid ${t.border}`,
        transition: 'border-color .15s',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: currentProv.color }}>{currentProv.label}</span>
        <span style={{ color: t.border, fontSize: 13 }}>·</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{currentModel?.label}</span>
        {currentModel?.recommended && (
          <span style={{ fontSize: 9, background: t.successSolid, color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>★</span>
        )}
        <ChevronDown size={12} color={t.muted} style={{ marginLeft: 1 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 300,
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: t.radiusLg, boxShadow: t.shadowMd,
          minWidth: 300, maxHeight: 420, overflowY: 'auto',
        }}>
          {providers.map((prov, pi) => (
            <div key={prov.id}>
              {pi > 0 && <div style={{ height: 1, background: t.border }} />}
              <div style={{
                padding: '8px 14px 4px', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: prov.color, background: `${prov.color}08`,
              }}>
                {prov.label}
              </div>
              {prov.models.map(m => {
                const isSelected = provider === prov.id && modelId === m.id
                return (
                  <button key={m.id}
                    onClick={() => { if (provider !== prov.id) switchProvider(prov.id); setModelId(m.id); setOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                      padding: '9px 14px', border: 'none', cursor: 'pointer',
                      background: isSelected ? `${prov.color}10` : 'transparent',
                      borderLeft: isSelected ? `3px solid ${prov.color}` : '3px solid transparent',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = t.bgMuted }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 12, color: isSelected ? prov.color : t.text }}>{m.label}</span>
                      {m.recommended && (
                        <span style={{ fontSize: 9, background: t.successSolid, color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>
                          {recommended}
                        </span>
                      )}
                    </div>
                    {m.desc && <div style={{ fontSize: 11, color: t.muted }}>{m.desc}</div>}
                    {m.tags && m.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {m.tags.map(tag => (
                          <span key={tag} style={{
                            fontSize: 9, padding: '1px 6px', borderRadius: 10,
                            background: `${prov.color}18`, color: prov.color,
                            border: `1px solid ${prov.color}30`, fontWeight: 600,
                          }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
