import { ensureEventName } from '../../shared/omino/attributes'

/** The platform's `EventListener` object, with `addEventListener`'s options. */
export interface ListenerObject {
  handleEvent(event: Event): unknown
  passive?: boolean
  capture?: boolean
  once?: boolean
}

/**
 * `on<lowercase>` exactly as HTML (C.18a): a direct `addEventListener`,
 * removed when `signal` aborts. A function, or a `ListenerObject` for
 * `passive` / `capture` / `once`. No delegation: `stopPropagation` keeps its
 * platform meaning.
 *
 *   <div onwheel={{ handleEvent: zoom, passive: true }} />
 */
export function listen(
  el: Element,
  name: string,
  value: unknown,
  signal: AbortSignal,
): void {
  if (value === null || value === undefined) return
  const type = eventType(el, name)
  if (typeof value === 'function')
    el.addEventListener(type, value as EventListener, { signal })
  else if (isListenerObject(value))
    el.addEventListener(type, value, options(value, signal))
  else throw notAListener(el, name, value)
}

/** Any spelling (`ONCLICK` too): the lowercase rule then refuses what HTML would run as inline JS. */
export function isEventName(name: string): boolean {
  return name.length > 2 && /^on/i.test(name)
}

function eventType(el: Element, name: string): string {
  ensureEventName(el.localName, name)
  return name.slice(2)
}

function isListenerObject(value: unknown): value is ListenerObject {
  return (
    typeof value === 'object' &&
    typeof (value as ListenerObject | null)?.handleEvent === 'function'
  )
}

function options(value: ListenerObject, signal: AbortSignal) {
  const { passive, capture, once } = value
  return { passive, capture, once, signal }
}

/** A string would be inline JavaScript: refused, as on the server (C.18d). */
function notAListener(el: Element, name: string, value: unknown): Error {
  if (typeof value === 'string')
    return new Error(
      `omino: <${tag(el)} ${name}="…"> would be inline JavaScript, which omino never writes. Pass a function`,
    )
  return new Error(
    `omino: <${tag(el)} ${name}> takes a function or { handleEvent, passive, capture, once }`,
  )
}

function tag(el: Element): string {
  return el.localName
}
