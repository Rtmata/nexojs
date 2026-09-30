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

/**
 * What the `class` attribute accepts: a string, a list, or an object whose
 * keys are kept when their value is truthy. Falsy values are dropped.
 *
 *   ['btn', `btn-${variant}`, size && `btn-${size}`, { 'btn-disabled': disabled }]
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | boolean
  | readonly ClassValue[]
  | { readonly [name: string]: unknown }

export function classNames(value: ClassValue): string {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim()
  }
  if (value === true) return ''
  if (Array.isArray(value)) {
    return value.map(classNames).filter(Boolean).join(' ')
  }
  return Object.entries(value)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .join(' ')
}

const VALID_TAG = /^[a-zA-Z][a-zA-Z0-9-]*$/
const VALID_ATTRIBUTE = /^[^\s"'<>/=]+$/

export function assertTag(tag: string): void {
  if (!VALID_TAG.test(tag)) throw new Error(`omino: invalid tag name <${tag}>`)
}

/**
 * Render the attributes of an element. `true` writes a bare attribute
 * (`disabled`), `false`, `null` and `undefined` leave it out.
 */
export function attributes(
  tag: string,
  props: Record<string, unknown>,
): string {
  let html = ''
  for (const [name, raw] of Object.entries(props)) {
    if (name === 'key') continue
    if (!VALID_ATTRIBUTE.test(name)) {
      throw new Error(`omino: invalid attribute name "${name}" on <${tag}>`)
    }

    const value = name === 'class' ? classNames(raw as ClassValue) : raw
    if (value === null || value === undefined || value === false) continue
    if (name === 'class' && value === '') continue
    if (value === true) {
      html += ` ${name}`
      continue
    }
    if (typeof value === 'function') {
      throw new Error(
        `omino: <${tag} ${name}> got a function. Server-rendered HTML can't carry event handlers; attach behavior in the browser instead`,
      )
    }
    if (typeof value === 'object') {
      throw new Error(
        `omino: <${tag} ${name}> must be a string, number or boolean`,
      )
    }
    html += ` ${name}="${escapeHtml(String(value))}"`
  }
  return html
}
