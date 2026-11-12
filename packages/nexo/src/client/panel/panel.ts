import { readParams, type Param, type ParamsOf } from './params'

/** A handler in the `events` map: the event, what `connect` returned, the element the selector matched. */
export type EventHandler<C> = (
  event: Event,
  ctx: C,
  matched: Element,
) => unknown

type Schema = Record<string, Param<unknown>>

export interface PanelOptions<S extends Schema, C> {
  /** Typed params, read from `data-<panel>-<key>`. */
  params?: S
  /** `'click .next': (e, ctx) => …` — declarative, so it can be inspected. */
  events?: Record<string, EventHandler<C>>
  /** Free code when it connects; what it returns is `ctx` for the handlers. */
  connect?(el: Element, params: ParamsOf<S>, run: { signal: AbortSignal }): C
}

/** What a panel is: the same shape as `ref`, plus its typed form. */
export interface Panel<S extends Schema, C> {
  /** Connect with the params' defaults. */
  (el: Element, run: { signal: AbortSignal }): void
  /** Already-typed params, no parsing: `ref={gallery.with({ start: 2 })}`. */
  with(
    params: Partial<ParamsOf<S>>,
  ): (el: Element, run: { signal: AbortSignal }) => void
  /** Types only: the params' schema, for `registry().markup`. */
  readonly schema?: S
  /** Types only: what `connect` returns. */
  readonly ctx?: C
}

/** What `attach` and `registry` need of a panel, kept out of its public shape. */
export interface PanelInside {
  /** Params from the markup's `data-<name>-<key>`. */
  fromMarkup(el: Element, name: string, run: { signal: AbortSignal }): void
  readonly params: Schema
}

const insides = new WeakMap<Function, PanelInside>()

/** A panel's inside; a function `panel()` didn't make has none. */
export function insideOf(found: unknown): PanelInside | undefined {
  return typeof found === 'function' ? insides.get(found) : undefined
}

/**
 * A behavior for markup that's already there: params, an events map
 * and free code, as one plain function of `(el, { signal })`. Works without
 * signals; everything it adds ends with `signal`.
 *
 *   import * as param from '@nexoamigos/nexo/panel/params' // a namespace
 *
 *   const gallery = panel({
 *     params: { start: param.number(0) },
 *     connect: (el, { start }) => ({ index: start }),
 *     events: { 'click .next': (e, ctx) => show(++ctx.index) },
 *   })
 */
export function panel<S extends Schema = {}, C = void>(
  options: PanelOptions<S, C>,
): Panel<S, C> {
  const definition = new Definition(options)
  const connect = (el: Element, run: { signal: AbortSignal }) =>
    definition.connect(el, definition.defaults(), run.signal)
  insides.set(connect, definition.inside())
  return Object.assign(connect, {
    with: (given: Partial<ParamsOf<S>>) => definition.withParams(given),
  })
}

/** A panel's options and the three ways its params come: defaults, given, markup. */
class Definition<S extends Schema, C> {
  private readonly schema: S
  /** Read once, where the panel is written: a key that can't work throws there. */
  private readonly events: Map<string, Entry<C>[]>

  constructor(private readonly options: PanelOptions<S, C>) {
    this.schema = (options.params ?? {}) as S
    this.events = byType(options.events ?? {})
  }

  connect(el: Element, params: ParamsOf<S>, signal: AbortSignal): void {
    new Connection(this.options, this.events, el, params, signal)
  }

  /** What `attach` and `registry` read: params from markup, and the schema. */
  inside(): PanelInside {
    return {
      fromMarkup: (el, name, run) =>
        this.connect(el, this.read(name, el), run.signal),
      params: this.schema,
    }
  }

  defaults(): ParamsOf<S> {
    return readDefaults(this.schema)
  }

  read(name: string, el: Element): ParamsOf<S> {
    return readParams(this.schema, name, el)
  }

  /** Given params over the defaults; an `undefined` value is "not given". */
  withParams(given: Partial<ParamsOf<S>>) {
    return (el: Element, { signal }: { signal: AbortSignal }) =>
      this.connect(el, { ...this.defaults(), ...defined(given) }, signal)
  }
}

export function defined<T extends object>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

/** Every param's fallback: a parser given no attribute. */
function readDefaults<S extends Schema>(schema: S): ParamsOf<S> {
  const params: Record<string, unknown> = {}
  for (const [key, parser] of Object.entries(schema))
    params[key] = parser.parse(null, key)
  return params as ParamsOf<S>
}

/**
 * Events that don't bubble. On the panel's element itself they are heard
 * as any other; with a selector they would never reach it from below, so
 * that key is a mistake. The list is only for saying so: nothing is
 * rewritten or listened to in another phase.
 */
const TWIN: Record<string, string> = { focus: 'focusin', blur: 'focusout' }
const NON_BUBBLING = new Set([
  'focus',
  'blur',
  'mouseenter',
  'mouseleave',
  'pointerenter',
  'pointerleave',
  'load',
  'error',
  'scroll',
  'invalid',
  'toggle',
  'beforetoggle',
  'scrollend',
  'loadend',
  'progress',
  'abort',
  'cancel',
  'close',
  'resize',
  // media
  'play',
  'playing',
  'pause',
  'ended',
  'timeupdate',
  'durationchange',
  'volumechange',
  'ratechange',
  'seeking',
  'seeked',
  'waiting',
  'stalled',
  'suspend',
  'emptied',
  'loadstart',
  'loadedmetadata',
  'loadeddata',
  'canplay',
  'canplaythrough',
])

/** `'click .next'` → type and selector. */
type Entry<C> = { selector: string; handler: EventHandler<C> }

/** One panel on one element: `connect` runs, then one listener per event type on `el`. */
class Connection<S extends Schema, C> {
  private readonly ctx: C

  constructor(
    options: PanelOptions<S, C>,
    events: Map<string, Entry<C>[]>,
    private readonly el: Element,
    params: ParamsOf<S>,
    private readonly signal: AbortSignal,
  ) {
    this.ctx = undefined as C
    if (signal.aborted) return // over before it began: nothing to connect, nothing to end later
    this.ctx = options.connect
      ? options.connect(el, params, { signal })
      : (undefined as C)
    for (const [type, entries] of events) this.listen(type, entries)
  }

  /** One listener for the type, as written; each entry matches its own selector (no selector: `el` itself). */
  private listen(type: string, entries: Entry<C>[]): void {
    const listener = (event: Event) => {
      for (const entry of entries) this.dispatchSafely(event, entry)
    }
    this.el.addEventListener(type, listener, { signal: this.signal })
  }

  /** One handler's error never silences the next entry for the same event. */
  private dispatchSafely(event: Event, entry: Entry<C>): void {
    try {
      this.dispatch(event, entry)
    } catch (error) {
      reportError(error)
    }
  }

  /** Delegation: the closest match from the target, never past `el`. */
  private dispatch(event: Event, entry: Entry<C>): void {
    const matched = entry.selector
      ? closestInside(event.target, entry.selector, this.el)
      : this.el
    if (matched) entry.handler(event, this.ctx, matched)
  }
}

function byType<C>(
  events: Record<string, EventHandler<C>>,
): Map<string, Entry<C>[]> {
  const types = new Map<string, Entry<C>[]>()
  for (const [key, handler] of Object.entries(events)) {
    const [type, ...rest] = key.trim().split(/\s+/)
    const selector = rest.join(' ')
    if (selector && NON_BUBBLING.has(type!)) throw unheard(key, type!)
    const entries = types.get(type!) ?? []
    types.set(type!, [...entries, { selector, handler }])
  }
  return types
}

/** A key whose event can't bubble up to the panel's element from its selector. */
function unheard(key: string, type: string): Error {
  const twin = TWIN[type]
  const fix = twin
    ? `write '${key.trim().replace(type, twin)}'`
    : 'listen to it in connect, on the element itself'
  return new Error(
    `panel: '${key.trim()}': ${type} doesn't bubble, so a selector can't catch it from below; ${fix}`,
  )
}

/** The closest match from the event's target up to `root`, never past it. */
function closestInside(
  target: EventTarget | null,
  selector: string,
  root: Element,
): Element | null {
  const start =
    target instanceof Element
      ? target
      : ((target as Node | null)?.parentElement ?? null)
  const matched = start?.closest(selector) ?? null
  return matched && root.contains(matched) ? matched : null
}
