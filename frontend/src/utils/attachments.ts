export type AttachmentKind = 'text' | 'pdf' | 'image' | 'office'
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
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_MAX_MB = ATTACHMENT_MAX_BYTES / (1024 * 1024)
export const ATTACHMENT_MAX_TOTAL_CHARS = 40_000

// Plain-text formats — code, configs, data exports, Odoo translation catalogs.
const ATTACHMENT_TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'tsv', 'json', 'xml', 'py', 'log',
  'yaml', 'yml', 'html', 'htm', 'sql', 'po', 'pot',
  'ini', 'conf', 'cfg', 'toml', 'rst', 'js', 'ts', 'css', 'scss', 'sh',
])
const ATTACHMENT_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
const ATTACHMENT_OFFICE_EXTENSIONS = new Set(['xlsx', 'xls'])

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
}
const OFFICE_MIME_BY_EXT: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
}

/** `accept` attribute value shared by every attachment file input. */
export const ATTACHMENT_ACCEPT = [
  ...[...ATTACHMENT_TEXT_EXTENSIONS].map(e => `.${e}`),
  '.pdf',
  ...[...ATTACHMENT_IMAGE_EXTENSIONS].map(e => `.${e}`),
  ...[...ATTACHMENT_OFFICE_EXTENSIONS].map(e => `.${e}`),
  'application/pdf', 'image/*',
].join(',')

export function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function fileKind(file: File): AttachmentKind | null {
  const ext = fileExt(file.name)
  if (ext === 'pdf') return 'pdf'
  if (ATTACHMENT_IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (ATTACHMENT_OFFICE_EXTENSIONS.has(ext)) return 'office'
  if (ATTACHMENT_TEXT_EXTENSIONS.has(ext)) return 'text'
  return null
}

/** PDF, image and office files travel as base64; text files travel as plain text. */
export function attachmentNeedsBase64(kind: AttachmentKind): boolean {
  return kind === 'pdf' || kind === 'image' || kind === 'office'
}

/** Best-effort MIME type when the browser does not provide one. */
export function defaultMimeType(file: File, kind: AttachmentKind): string {
  if (file.type) return file.type
  if (kind === 'pdf') return 'application/pdf'
  if (kind === 'image') return IMAGE_MIME_BY_EXT[fileExt(file.name)] ?? 'image/png'
  if (kind === 'office') return OFFICE_MIME_BY_EXT[fileExt(file.name)] ?? OFFICE_MIME_BY_EXT.xlsx
  return 'text/plain'
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
