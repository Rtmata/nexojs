/** Elements that never have children or a closing tag. */
export const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

/** Elements whose content is raw text, never parsed as HTML. */
export const RAW_TEXT_ELEMENTS = new Set(['script', 'style'])

const TEXT_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape text so it is shown as text, never read as HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => TEXT_ENTITIES[char]!)
}

const VALID_TAG = /^[a-zA-Z][a-zA-Z0-9-]*$/

export function assertTag(tag: string): void {
  if (VALID_TAG.test(tag)) return
  throw new Error(
    `omino: <${tag}> is not a tag name. Use letters, digits and '-', starting with a letter`,
  )
}
