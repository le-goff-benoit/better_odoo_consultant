export type SourceSyncStatus = 'running' | 'done' | 'error'

export interface SourceSyncSignal {
  version: string
  status: SourceSyncStatus
  pct: number
  label: string
  logs: string[]
  enterprise: boolean
  startedAt: number
  updatedAt: number
}

interface ProgressEvt {
  type: 'start' | 'log' | 'progress' | 'done' | 'error' | 'separator' | 'end'
  msg?: string
  label?: string
  pct?: number
}

interface SyncLabels {
  start?: string
  done?: string
  error?: string
}

const signals = new Map<string, SourceSyncSignal>()
const controllers = new Map<string, AbortController>()
const listeners = new Set<() => void>()

function notify() { listeners.forEach(fn => fn()) }

function patch(version: string, update: Partial<SourceSyncSignal>) {
  const current = signals.get(version)
  if (!current) return
  signals.set(version, { ...current, ...update, updatedAt: Date.now() })
  notify()
}

function appendLog(version: string, log: string) {
  const current = signals.get(version)
  if (!current || !log) return
  signals.set(version, {
    ...current,
    label: log,
    logs: [...current.logs, log],
    updatedAt: Date.now(),
  })
  notify()
}

export const sourceSyncSignals = {
  get(version: string): SourceSyncSignal | undefined {
    return signals.get(version)
  },
  getAll(): Array<[string, SourceSyncSignal]> {
    return [...signals.entries()]
  },
  running(): SourceSyncSignal[] {
    return [...signals.values()].filter(s => s.status === 'running')
  },
  hasRunning(): boolean {
    return this.running().length > 0
  },
  clear(version: string) {
    if (signals.delete(version)) notify()
  },
  abort(version: string) {
    controllers.get(version)?.abort()
    if (signals.delete(version)) notify()
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  async start({ version, path, enterprise, labels = {} }: {
    version: string
    path: string
    enterprise: boolean
    labels?: SyncLabels
  }) {
    controllers.get(version)?.abort()
    const ctrl = new AbortController()
    controllers.set(version, ctrl)

    signals.set(version, {
      version,
      status: 'running',
      pct: 0,
      label: labels.start ?? 'Starting...',
      logs: [],
      enterprise,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    })
    notify()

    try {
      const res = await fetch('/api/sources/sync-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, path, community: true, enterprise }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        patch(version, { status: 'error', label: `HTTP ${res.status}` })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let evt: ProgressEvt
          try { evt = JSON.parse(line.slice(6)) } catch { continue }

          if (evt.type === 'progress') {
            const label = evt.label ?? ''
            patch(version, { pct: evt.pct ?? 0, label })
            if (label) appendLog(version, label)
          } else if (evt.type === 'log' || evt.type === 'start') {
            appendLog(version, evt.msg ?? '')
          } else if (evt.type === 'done') {
            patch(version, { status: 'done', pct: 100, label: evt.msg ?? labels.done ?? 'Done' })
          } else if (evt.type === 'error') {
            patch(version, { status: 'error', label: evt.msg ?? labels.error ?? 'Error' })
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      patch(version, { status: 'error', label: String(err) })
    } finally {
      controllers.delete(version)
    }
  },
}
