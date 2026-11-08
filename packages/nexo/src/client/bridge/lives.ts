import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'

/** Kept alive across swaps, as Turbo's `data-turbo-permanent` (C.19b). */
export const PERSIST = 'data-bridge-persist'

/** What lives on its own: the page root, each segment, each persisted element. */
const OWNER = `[${SEGMENT_ATTRIBUTE}], [${PERSIST}]`

/**
 * Each segment's lifetime (C.19b, R.17): a signal, made the first time it's
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
 * root last, then for each one that arrives (R.17). The first load is one
 * more arrival, so a module that starts late misses nothing.
 *
 *   arrivals((segment, { signal }) => attach(segment, registry, { signal }), { signal })
 */
export function arrivals(
  fn: Arrival,
  options: { signal?: AbortSignal } = {},
): void {
  visit(document.body, fn)
  const arrived = (event: Event) => visit(event.target as Element, fn)
  document.addEventListener('bridge:swapped', arrived, {
    signal: options.signal,
  })
}

/** Roots `visit` has been through: an arrival on one of them again is an append or prepend. */
const visited = new WeakSet<Element>()

/**
 * An arrived element and the owners inside it, deepest first, itself last.
 * An append or prepend swap arrives on its container again (so what was
 * added inside attaches: `attach` is idempotent); the owners inside that
 * were already alive before it are not visited twice. A replaced segment
 * is new, so everything inside it is visited, persisted elements included.
 */
function visit(root: Element, fn: Arrival): void {
  const again = visited.has(root)
  visited.add(root)
  const inside = [...root.querySelectorAll(OWNER)]
    .reverse()
    .filter((element) => !again || !lives.has(element))
  for (const element of [...inside, root]) arrive(fn, element)
}

/** One segment's error is reported; the rest still arrive. */
function arrive(fn: Arrival, element: Element): void {
  try {
    fn(element, { signal: lives.of(element) })
  } catch (error) {
    reportError(error)
  }
}
