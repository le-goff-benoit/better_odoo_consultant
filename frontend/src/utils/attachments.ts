export type AttachmentKind = 'text' | 'pdf'
export type AttachmentStatus = 'ready' | 'error'

export interface AttachmentPayload {
  name: string
  mime_type: string
  size: number
  kind: AttachmentKind
  text?: string
  content_base64?: string
}

export interface AttachmentMeta {
  name: string
  size: number
  kind: AttachmentKind
}

export interface AttachmentDraft extends AttachmentPayload {
  id: string
  status: AttachmentStatus
  error?: string
}

export const ATTACHMENT_MAX_FILES = 5
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_MAX_TOTAL_CHARS = 40_000

const ATTACHMENT_TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json', 'xml', 'py', 'log'])

export function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function fileKind(file: File): AttachmentKind | null {
  const ext = fileExt(file.name)
  if (ext === 'pdf') return 'pdf'
  if (ATTACHMENT_TEXT_EXTENSIONS.has(ext)) return 'text'
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'))
    reader.readAsDataURL(file)
  })
}

export function attachmentMeta(att: AttachmentDraft): AttachmentMeta {
  return { name: att.name, size: att.size, kind: att.kind }
}

export function attachmentPayload(att: AttachmentDraft): AttachmentPayload {
  const { id: _id, status: _status, error: _error, ...payload } = att
  return payload
}
