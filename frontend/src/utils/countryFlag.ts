// Convert an ISO 3166-1 alpha-2 country code (e.g. "FR", "CH") to a flag emoji.
// Each letter is mapped to its regional-indicator codepoint (A=0x1F1E6).
//
// Returns an empty string for invalid input. Safe to use in tight loops:
// the function is pure and allocates only a short string.
export function countryFlag(code?: string | null): string {
  if (!code) return ''
  const trimmed = code.trim()
  if (trimmed.length !== 2) return ''
  const upper = trimmed.toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return ''
  const base = 0x1F1E6 - 'A'.charCodeAt(0)
  return String.fromCodePoint(upper.charCodeAt(0) + base, upper.charCodeAt(1) + base)
}

// Returns "🇫🇷 FR · EUR" style label, falling back gracefully when fields
// are missing. Used in places that want flag + code + currency in one go.
export function flagLabel(code?: string | null, currency?: string | null): string {
  const flag = countryFlag(code)
  const parts: string[] = []
  if (flag) parts.push(flag)
  if (code) parts.push(code.toUpperCase())
  if (currency) parts.push(currency)
  return parts.join(' ')
}
