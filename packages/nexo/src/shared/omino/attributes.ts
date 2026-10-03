import { escapeHtml } from './html'

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

// No spaces, quotes, '<', '>', '/', '=' or control characters.
const VALID_ATTRIBUTE = /^[^\s\x00-\x1f"'<>/=]+$/

/** Attributes whose value is a URL the browser loads or follows. */
const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'cite',
  'data',
  'background',
  'ping',
  'manifest',
  'xlink:href',
])

/** A URL that runs code instead of going somewhere (browsers ignore spaces and tabs in it). */
const SCRIPT_URL = /^(javascript|vbscript):/i

/**
 * The attributes of one element, as HTML. `true` writes a bare attribute
 * (`disabled`); `false`, `null` and `undefined` leave it out. Code is never
 * written into the page: event handlers (`on…`) and `javascript:` URLs are
 * refused with a clear error, and so are objects.
 *
 *   new Attributes().render('a', { href: '/nes', class: ['card', { big: true }] })
 *   // ' href="/nes" class="card big"'
 */
export class Attributes {
  render(tag: string, props: Record<string, unknown>): string {
    return Object.entries(props)
      .map(([name, value]) => this.one(tag, name, value))
      .join('')
  }

  private one(tag: string, name: string, raw: unknown): string {
    ensureName(tag, name)
    const value = name === 'class' ? classNames(raw as ClassValue) || null : raw
    if (value === null || value === undefined || value === false) return ''
    ensureNoCode(tag, name, value)
    if (value === true) return ` ${name}`
    ensureText(tag, name, value)
    return ` ${name}="${escapeHtml(String(value))}"`
  }
}

function ensureName(tag: string, name: string): void {
  if (VALID_ATTRIBUTE.test(name)) return
  throw new Error(
    `omino: "${name}" on <${tag}> is not an attribute name. Leave out spaces, quotes, control characters, '<', '>', '/' and '='`,
  )
}

/** An attribute that would put code in the page: an event handler, or a URL that runs script. */
function ensureNoCode(tag: string, name: string, value: unknown): void {
  if (/^on/i.test(name))
    throw new Error(
      `omino: <${tag} ${name}> is not allowed. Server-rendered HTML carries no event handlers; attach behavior in the browser instead`,
    )
  if (!URL_ATTRIBUTES.has(name.toLowerCase())) return
  if (!SCRIPT_URL.test(String(value).replace(/[\s\x00-\x1f]/g, ''))) return
  throw new Error(
    `omino: <${tag} ${name}> holds a script URL, which runs code. Link to a real URL; for markup you fully trust, use raw()`,
  )
}

function ensureText(tag: string, name: string, value: unknown): void {
  if (typeof value !== 'function' && typeof value !== 'object') return
  throw new Error(
    `omino: <${tag} ${name}> must be a string, number or boolean. Turn it into text first (JSON.stringify for data)`,
  )
}

export function classNames(value: ClassValue): string {
  if (!value || value === true) return ''
  if (typeof value === 'string' || typeof value === 'number')
    return String(value).trim()
  if (Array.isArray(value))
    return value.map(classNames).filter(Boolean).join(' ')
  return Object.entries(value)
    .filter(([, on]) => on)
    .map(([name]) => name)
    .join(' ')
}
