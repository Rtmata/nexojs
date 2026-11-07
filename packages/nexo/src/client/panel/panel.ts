import { readParams, type Param, type ParamsOf } from './params'

/** A handler in the `events` map: the event, what `connect` returned, the element the selector matched. */
export type EventHandler<C> = (
  event: Event,
  ctx: C,
  matched: Element,
) => unknown

type Schema = Record<string, Param<unknown>>

export interface PanelOptions<S extends Schema, C> {
  /** Typed params, read from `data-<panel>-<key>` (D.3). */
  params?: S
  /** `'click .next': (e, ctx) => …` — declarative, so it can be inspected (D.1). */
  events?: Record<string, EventHandler<C>>
  /** Free code when it connects; what it returns is `ctx` for the handlers. */
  connect?(el: Element, params: ParamsOf<S>, run: { signal: AbortSignal }): C
}

/** What a panel is: the same shape as `ref` (C.17a), plus its typed and markup forms. */
export interface Panel<S extends Schema, C> {
  /** Connect with the params' defaults. */
  (el: Element, run: { signal: AbortSignal }): void
  /** Already-typed params, no parsing: `ref={gallery.with({ start: 2 })}`. */
  with(
    params: Partial<ParamsOf<S>>,
  ): (el: Element, run: { signal: AbortSignal }) => void
  /** Params from the markup's `data-<name>-<key>`: what `attach` uses. */
  fromMarkup(el: Element, name: string, run: { signal: AbortSignal }): void
  readonly options: PanelOptions<S, C>
}

/**
 * A behavior for markup that's already there (D.1): params, an events map
 * and free code, as one plain function of `(el, { signal })`. Works without
 * signals (A.1); everything it adds ends with `signal`.
 *
 *   const gallery = panel({
 *     params: { start: number(0) },
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
  return Object.assign(connect, {
    with: (given: Partial<ParamsOf<S>>) => definition.withParams(given),
    fromMarkup: (el: Element, name: string, run: { signal: AbortSignal }) =>
      definition.connect(el, definition.read(name, el), run.signal),
    options,
  })
}

/** A panel's options and the three ways its params come: defaults, given, markup. */
class Definition<S extends Schema, C> {
  private readonly schema: S

  constructor(private readonly options: PanelOptions<S, C>) {
    this.schema = (options.params ?? {}) as S
  }

  connect(el: Element, params: ParamsOf<S>, signal: AbortSignal): void {
    new Connection(this.options, el, params, signal)
  }

  defaults(): ParamsOf<S> {
    return readDefaults(this.schema)
  }

  read(name: string, el: Element): ParamsOf<S> {
    return readParams(this.schema, name, el)
  }

  withParams(given: Partial<ParamsOf<S>>) {
    return (el: Element, { signal }: { signal: AbortSignal }) =>
      this.connect(el, { ...this.defaults(), ...given }, signal)
  }
}

/** Every param's fallback: a parser given no attribute. */
function readDefaults<S extends Schema>(schema: S): ParamsOf<S> {
  const params: Record<string, unknown> = {}
  for (const [key, parser] of Object.entries(schema))
    params[key] = parser.parse(null, key)
  return params as ParamsOf<S>
}

/** Events that don't bubble: their bubbling twin, or listened to in the capture phase (D.2 b). */
const TWIN: Record<string, string> = { focus: 'focusin', blur: 'focusout' }
const NON_BUBBLING = new Set([
  'mouseenter',
  'mouseleave',
  'pointerenter',
  'pointerleave',
  'load',
  'error',
  'scroll',
  'invalid',
  'toggle',
])

/** One panel on one element: `connect` runs, then one listener per event type on `el` (D.2 b). */
class Connection<S extends Schema, C> {
  private readonly ctx: C

  constructor(
    private readonly options: PanelOptions<S, C>,
    private readonly el: Element,
    params: ParamsOf<S>,
    private readonly signal: AbortSignal,
  ) {
    this.ctx = options.connect
      ? options.connect(el, params, { signal })
      : (undefined as C)
    for (const [key, handler] of Object.entries(options.events ?? {}))
      this.listen(key, handler)
  }

  /** `'click .next'`: on `el`, for targets inside it that match; no selector: `el` itself. */
  private listen(key: string, handler: EventHandler<C>): void {
    const [type, ...rest] = key.trim().split(/\s+/)
    const selector = rest.join(' ')
    const listener = (event: Event) => this.dispatch(event, selector, handler)
    const capture = NON_BUBBLING.has(type!)
    this.el.addEventListener(TWIN[type!] ?? type!, listener, {
      capture,
      signal: this.signal,
    })
  }

  private dispatch(
    event: Event,
    selector: string,
    handler: EventHandler<C>,
  ): void {
    const matched = selector
      ? closestInside(event.target, selector, this.el)
      : this.el
    if (matched) handler(event, this.ctx, matched)
  }
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
