import { SEGMENT_ATTRIBUTE } from '../../shared/markup/vocabulary'

/** Kept alive across swaps, as Turbo's `data-turbo-permanent`. */
export const PERSIST = 'data-bridge-persist'

/** What lives on its own: the page root, each segment, each persisted element. */
const OWNER = `[${SEGMENT_ATTRIBUTE}], [${PERSIST}]`

/**
 * Each segment's lifetime: a signal, made the first time it's
 * asked for, a child of the closest enclosing segment's, so an outer
 * segment replaced ends the inner ones. A persisted element lives on its
 * own: it outlives the segments it moves between, and whole-page swaps. The
 * page root is `<body>`, replaced only by a whole-page swap.
 */
class Lives {
  private readonly controllers = new WeakMap<Element, AbortController>()

  of(element: Element): AbortSignal {
    return this.controllerOf(element).signal
  }

  /** Whether the element already has a life (it arrived before). */
  has(element: Element): boolean {
    return this.controllers.has(element)
  }

  /** The element leaves: its life ends, and every life inside it. */
  end(element: Element): void {
    this.controllers.get(element)?.abort()
  }

  private controllerOf(element: Element): AbortController {
    let controller = this.controllers.get(element)
    if (controller) return controller
    controller = new AbortController()
    this.link(controller, ownerAbove(element))
    this.controllers.set(element, controller)
    return controller
  }

  private link(controller: AbortController, owner: Element | null): void {
    if (!owner) return
    const parent = this.of(owner)
    const end = () => controller.abort(parent.reason)
    parent.addEventListener('abort', end, {
      once: true,
      signal: controller.signal,
    })
  }
}

export const lives = new Lives()

/** Whose life an element's is part of: the closest owner above it, else the page root. */
function ownerAbove(element: Element): Element | null {
  if (element === document.body || element.hasAttribute(PERSIST)) return null
  return element.parentElement?.closest(OWNER) ?? document.body
}

export type Arrival = (
  element: Element,
  run: { signal: AbortSignal },
) => unknown

/**
 * Run `fn` now for every segment on the page, innermost first and the page
 * root last, then for each one that arrives. The first load is one
 * more arrival, so a module that starts late misses nothing.
 *
 *   arrivals((segment, { signal }) => attach(segment, registry, { signal }), { signal })
 */
export function arrivals(fn: Arrival, options: { signal: AbortSignal }): void {
  const { signal } = options
  if (signal.aborted) return
  const subscriber = new Subscriber(fn, signal)
  subscriber.visit(document.body)
  const arrived = (event: Event) => subscriber.visit(event.target as Element)
  document.addEventListener('bridge:swapped', arrived, { signal })
}

/**
 * One `arrivals` call: what it was given, so an append or prepend arriving
 * on its container again doesn't hand it the owners already alive inside;
 * kept per call, so a second call still gets every segment.
 */
class Subscriber {
  private readonly roots = new WeakSet<Element>()
  private readonly given = new WeakSet<Element>()

  constructor(
    private readonly fn: Arrival,
    private readonly signal: AbortSignal,
  ) {}

  /** An arrived element and the owners inside it, deepest first, itself last. */
  visit(root: Element): void {
    const again = this.roots.has(root)
    this.roots.add(root)
    const inside = [...root.querySelectorAll(OWNER)]
      .reverse()
      .filter((element) => !again || !this.given.has(element))
    for (const element of [...inside, root]) this.arrive(element)
  }

  /** Each life ends with its segment, or with this call's signal. */
  private arrive(element: Element): void {
    this.given.add(element)
    const life = AbortSignal.any([lives.of(element), this.signal])
    arrive(this.fn, element, life)
  }
}

/** One segment's error is reported; the rest still arrive. */
function arrive(fn: Arrival, element: Element, signal: AbortSignal): void {
  try {
    fn(element, { signal })
  } catch (error) {
    reportError(error)
  }
}
