/** Clipboard helpers for AI answers — rich (formatted) vs. raw Markdown. */

/**
 * Copy a rendered element as rich text: the HTML goes on the clipboard as
 * `text/html`, so pasting into Word, Gmail, Notion… keeps headings, bold,
 * lists and tables. A plain-text flavour is attached for editors that only
 * accept `text/plain`.
 */
export async function copyRichText(
  element: HTMLElement | null,
  plainFallback: string,
): Promise<void> {
  const html = element?.innerHTML ?? ''
  const plain = element?.innerText || plainFallback
  if (html && navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new window.ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      return
    } catch {
      // Some browsers / insecure contexts reject ClipboardItem — fall back.
    }
  }
  await navigator.clipboard.writeText(plain)
}

/** Copy the raw Markdown source as plain text. */
export async function copyMarkdown(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
