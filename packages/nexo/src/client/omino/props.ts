import {
  classNames,
  ensureCssName,
  ensureName,
  ensureNoScriptUrl,
  type ClassValue,
} from '../../shared/omino/attributes'
import { isHole } from '../../shared/omino/hole'
import { Bindings, type Where } from './bindings'
import type { Holes } from './holes'
import { isEventName, listen } from './listeners'
import type { Motions } from './motions'

/**
 * The properties whose attribute is only the initial value (R.13): the
 * standard's own list, written as properties so what shows is the live state.
 */
const LIVE = new Set([
  'value',
  'checked',
  'selected',
  'muted',
  'indeterminate',
  'defaultValue',
  'defaultChecked',
])

const SVG = 'http://www.w3.org/2000/svg'

/** Nexo's own: how the element comes and goes (C.15c), never attributes. */
const MOTION_PROPS = new Set(['enter', 'exit', 'exit-timeout'])

/**
 * Writes an element's props: as attributes, as the server does, except the
 * live-state list and `prop:…` (R.13); `class` and `style` objects key by key
 * (C.20); `on…` as listeners (C.18a). Any value may be a hole.
 */
export class ElementProps {
  private readonly bindings: Bindings

  constructor(
    private readonly holes: Holes,
    private readonly motions: Motions,
  ) {
    this.bindings = new Bindings(holes)
  }

  /** `bind:` last: it reads what the others set (`type`, `contenteditable`). */
  apply(el: Element, props: Record<string, unknown>, at: Where) {
    const entries = Object.entries(props)
    for (const [name, value] of entries)
      if (!isBinding(name)) this.one(el, name, value, at.signal)
    const on = props['bind-on'] as string | undefined
    for (const [name, value] of entries)
      if (isBinding(name)) this.bindings.bind(el, name.slice(5), value, on, at)
  }

  private one(el: Element, name: string, value: unknown, signal: AbortSignal) {
    if (isEventName(name)) return listen(el, name, value, signal)
    if (name.startsWith('prop:')) return this.property(el, name, value, signal)
    if (name === 'bind-on') return
    if (MOTION_PROPS.has(name)) return this.motions.set(el, name, value)
    ensureName(el.localName, name)
    if (name === 'class') return this.classes(el, value, signal)
    if (name === 'style') return this.styles(el, value, signal)
    if (LIVE.has(name) && el.namespaceURI !== SVG)
      return this.holes.write(value, (v) => setLive(el, name, v), signal)
    this.holes.write(value, (v) => setAttribute(el, name, v), signal)
  }

  private property(
    el: Element,
    name: string,
    value: unknown,
    signal: AbortSignal,
  ) {
    const key = name.slice('prop:'.length)
    this.holes.write(value, (v) => ((el as any)[key] = v), signal)
  }

  /** An object: each class on its own, each value maybe a hole. Else the whole attribute (C.20c). */
  /**
   * A string, function or readable: one hole for the whole attribute. An
   * object: a hole per key. An array: each entry its own way (`['btn',
   * { active: isActive }, () => size.get()]`), so nested holes stay live.
   */
  private classes(el: Element, value: unknown, signal: AbortSignal) {
    if (Array.isArray(value)) return this.classList(el, value, signal)
    if (!isPlainObject(value))
      return this.holes.write(
        value,
        (v) => setClass(el, v as ClassValue),
        signal,
      )
    for (const [names, on] of Object.entries(value))
      this.holes.write(on, (v) => toggle(el, names, Boolean(v)), signal)
  }

  /**
   * Each entry is a hole (an object: one per key); whenever one changes,
   * the whole class list is written again from every entry's current
   * names, so a name two entries share is never lost when one lets go.
   */
  private classList(el: Element, entries: unknown[], signal: AbortSignal) {
    const parts: string[] = entries.map(() => '')
    const write = (i: number, names: string) => {
      parts[i] = names
      setClass(el, parts)
    }
    entries.forEach((entry, i) => this.part(entry, (n) => write(i, n), signal))
  }

  /** One entry's names as they change: an object's keys each on their own hole, anything else one hole. */
  private part(
    entry: unknown,
    changed: (names: string) => void,
    signal: AbortSignal,
  ) {
    if (isPlainObject(entry)) return this.objectPart(entry, changed, signal)
    this.holes.write(entry, (v) => changed(classNames(v as ClassValue)), signal)
  }

  private objectPart(
    entry: Record<string, unknown>,
    changed: (names: string) => void,
    signal: AbortSignal,
  ) {
    const on = new Map<string, boolean>()
    for (const [names, value] of Object.entries(entry))
      this.holes.write(
        value,
        (v) => (on.set(names, Boolean(v)), changed(held(on))),
        signal,
      )
  }

  /** An object: CSS's own property names, each value maybe a hole (C.20b). */
  private styles(el: Element, value: unknown, signal: AbortSignal) {
    if (!isPlainObject(value))
      return this.holes.write(
        value,
        (v) => setAttribute(el, 'style', v),
        signal,
      )
    for (const [property, given] of Object.entries(value))
      this.style(el, property, given, signal)
  }

  private style(
    el: Element,
    property: string,
    value: unknown,
    signal: AbortSignal,
  ) {
    ensureCssName(el.localName, property)
    const style = (el as HTMLElement).style
    this.holes.write(value, (v) => setStyle(style, property, v), signal)
  }
}

function setAttribute(el: Element, name: string, value: unknown): void {
  if (value === null || value === undefined || value === false)
    return el.removeAttribute(name)
  if (value === true) return el.setAttribute(name, '')
  ensureText(el, name, value)
  ensureNoScriptUrl(el.localName, name, value)
  el.setAttribute(name, String(value))
}

function setLive(el: Element, name: string, value: unknown): void {
  const isText = name === 'value' || name === 'defaultValue'
  ;(el as any)[name] = isText ? String(value ?? '') : Boolean(value)
}

/** The names whose value holds now. */
function held(on: Map<string, boolean>): string {
  return [...on]
    .filter(([, v]) => v)
    .map(([names]) => names)
    .join(' ')
}

function setClass(el: Element, value: ClassValue): void {
  const names = classNames(value)
  if (names) el.setAttribute('class', names)
  else el.removeAttribute('class')
}

function toggle(el: Element, names: string, on: boolean): void {
  for (const name of names.split(/\s+/).filter(Boolean))
    el.classList.toggle(name, on)
}

function setStyle(style: CSSStyleDeclaration, name: string, value: unknown) {
  if (value === null || value === undefined || value === false)
    style.removeProperty(name)
  else style.setProperty(name, String(value))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !isHole(value)
  )
}

function ensureText(el: Element, name: string, value: unknown): void {
  if (typeof value !== 'object' && typeof value !== 'function') return
  throw new Error(
    `omino: <${el.localName} ${name}> must be a string, number or boolean. For an object on a web component, write prop:${name}`,
  )
}

function isBinding(name: string): boolean {
  return name.startsWith('bind:')
}
