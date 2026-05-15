// Module-level store — survives React component unmounts.
// Used to show streaming/done indicators in the nav and on chat pages.

export type StreamStatus = 'streaming' | 'done'

export interface StreamSignal {
  status: StreamStatus
  label: string
  pageKey: 'assistant' | 'migration'
}

const map = new Map<string, StreamSignal>()
const listeners = new Set<() => void>()

function notify() { listeners.forEach(f => f()) }

export const streamingSignals = {
  /** Start or update a stream entry */
  set(id: string, signal: StreamSignal) {
    map.set(id, signal)
    notify()
  },
  /** Mark a stream as done */
  done(id: string) {
    const s = map.get(id)
    if (s) { map.set(id, { ...s, status: 'done' }); notify() }
  },
  /** Remove an entry (on reset / new conversation) */
  clear(id: string) {
    if (map.has(id)) { map.delete(id); notify() }
  },
  /** All entries as array */
  getAll(): Array<[string, StreamSignal]> { return [...map.entries()] },
  /** Any stream active or done for a given page */
  forPage(pageKey: 'assistant' | 'migration'): StreamSignal[] {
    return [...map.values()].filter(s => s.pageKey === pageKey)
  },
  /** Subscribe to changes. Returns unsubscribe function. */
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
