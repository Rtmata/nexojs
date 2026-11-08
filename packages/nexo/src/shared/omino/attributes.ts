import { readOnce } from './hole'
import { isOwnProp } from './own-props'
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
  | (() => ClassValue)
  | { readonly get: () => ClassValue }

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
  render(tag: string, given: Record<string, unknown>): string {
    const props = { ...given, ...initialValues(tag, given) }
    return Object.entries(props)
      .filter(([name]) => !isOwnProp(name))
      .map(([name, value]) => this.one(tag, name, value))
      .join('')
  }

  private one(tag: string, name: string, given: unknown): string {
    ensureName(tag, name)
    if (/^on/i.test(name)) return handlerOnServer(tag, name, given)
    const raw = readOnce(given) // C.12: the server reads a hole once
    const value = valueOf(tag, name, raw)
    if (value === null || value === undefined || value === false) return ''
    ensureNoCode(tag, name, value)
    if (value === true) return ` ${name}`
    ensureText(tag, name, value)
    return ` ${name}="${escapeHtml(String(value))}"`
  }
}

/** Shared with the client renderer: the same names are refused on both sides. */
export function ensureName(tag: string, name: string): void {
  if (VALID_ATTRIBUTE.test(name)) return
  throw new Error(
    `omino: "${name}" on <${tag}> is not an attribute name. Leave out spaces, quotes, control characters, '<', '>', '/' and '='`,
  )
}

/** A URL that runs script. (Handlers are dealt with before: `handlerOnServer`.) */
function ensureNoCode(tag: string, name: string, value: unknown): void {
  ensureNoScriptUrl(tag, name, value)
}

/**
 * `on…` on the server (C.18d): a function (or `{ handleEvent }`) is the
 * browser's, so it's left out and the same JSX renders on both sides; text
 * would be inline JavaScript, refused on both sides.
 */
function handlerOnServer(tag: string, name: string, value: unknown): string {
  if (isAbsent(value)) return ''
  ensureEventName(tag, name)
  if (typeof value !== 'string') return ''
  throw new Error(
    `omino: <${tag} ${name}="…"> would be inline JavaScript: server-rendered HTML carries no event handlers. Pass a function; it runs in the browser`,
  )
}

/** Shared with the client: event names are lowercase, as in HTML (C.18a). */
export function ensureEventName(tag: string, name: string): void {
  const type = name.slice(2)
  if (type === type.toLowerCase()) return
  throw new Error(
    `omino: <${tag} ${name}> never fires: event names are lowercase, as in HTML. Write on${type.toLowerCase()}`,
  )
}

/** `class` lists and objects, `style` objects (C.20b); anything else as given. */
function valueOf(tag: string, name: string, raw: unknown): unknown {
  if (name === 'class') return classNames(raw as ClassValue) || null
  if (name === 'style' && isStyleObject(raw)) return styleText(tag, raw) || null
  return raw
}

function isStyleObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** CSS's own names (kebab-case); each value maybe a hole, read once; `null`/`false` left out. */
function styleText(tag: string, style: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [property, given] of Object.entries(style)) {
    ensureCssName(tag, property)
    const value = readOnce(given)
    if (!isAbsent(value)) parts.push(`${property}: ${value}`)
  }
  return parts.join('; ')
}

/** Shared with the client: `fontSize` would be ignored without a word. */
export function ensureCssName(tag: string, name: string): void {
  if (name.startsWith('--') || !/[A-Z]/.test(name)) return
  const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
  throw new Error(
    `omino: <${tag} style={{ ${name} }}> uses CSS's own names: write '${kebab}'`,
  )
}

/**
 * `bind:` on the server: the signal's value now, as the attribute that
 * shows it at first (C.16). The browser binds it once it mounts.
 */
function initialValues(tag: string, props: Record<string, unknown>) {
  const read = (name: string) => readOnce(props[`bind:${name}`])
  const initial: Record<string, unknown> = {}
  if ('bind:value' in props && tag === 'input') initial.value = read('value')
  if ('bind:checked' in props) initial.checked = Boolean(read('checked'))
  if ('bind:open' in props) initial.open = Boolean(read('open'))
  if ('bind:group' in props)
    initial.checked = inGroup(read('group'), props.value)
  return initial
}

function inGroup(group: unknown, value: unknown): boolean {
  return Array.isArray(group) ? group.includes(value) : group === value
}

/** Shared with the client renderer: a URL that would run code is refused on both sides. */
export function ensureNoScriptUrl(
  tag: string,
  name: string,
  value: unknown,
): void {
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
  if (typeof value === 'function' || isReadable(value))
    return classNames(readOnce(value) as ClassValue) // a hole inside an array: read once here (the client keeps it live)
  if (Array.isArray(value))
    return value.map(classNames).filter(Boolean).join(' ')
  return onNames(value as { readonly [name: string]: unknown })
}

function isReadable(value: object): value is { get: () => ClassValue } {
  return typeof (value as { get?: unknown }).get === 'function'
}

/** `{ active: isActive }`: the names whose value holds. */
function onNames(value: { readonly [name: string]: unknown }): string {
  return Object.entries(value)
    .filter(([, on]) => readOnce(on))
    .map(([name]) => name)
    .join(' ')
}

/** What leaves an attribute out: `null`, `undefined`, `false`. */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === false
}
