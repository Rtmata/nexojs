import type { Panel } from './panel'
import { PanelRegistry } from './registry'
import { PANEL_ATTRIBUTE } from './vocabulary'

export { PANEL_ATTRIBUTE }

/** Panels by the name markup uses: `data-panel="gallery tabs"` (F.1). A plain object (D.2). */
export type Registry = Record<string, Panel<any, any>>

/** Who is connected, so `attach` is idempotent per element (item 36) and `observe` can end them. */
const connected = new WeakMap<Element, Map<string, AbortController>>()

/**
 * Connect every `data-panel` in `root` (itself included), each with a child
 * of `signal` (B.8). Explicit, no observer (D.2): call it on load and for
 * each arrival (`arrivals` from bridge, R.17). An element already connected
 * to a panel isn't connected again while that connection lives. A panel
 * that throws is reported (`reportError`) and skipped: the rest connect.
 */
export function attach(
  root: Element,
  registry: Registry | PanelRegistry<any>,
  { signal }: { signal: AbortSignal },
): void {
  const panels = registry instanceof PanelRegistry ? registry.panels : registry
  for (const el of withPanels(root))
    for (const name of namesOf(el)) connectOnce(el, name, panels, signal)
}

function withPanels(root: Element): Element[] {
  const inside = [...root.querySelectorAll(`[${PANEL_ATTRIBUTE}]`)]
  return root.hasAttribute(PANEL_ATTRIBUTE) ? [root, ...inside] : inside
}

function namesOf(el: Element): string[] {
  return (el.getAttribute(PANEL_ATTRIBUTE) ?? '').split(/\s+/).filter(Boolean)
}

function connectOnce(
  el: Element,
  name: string,
  registry: Registry,
  signal: AbortSignal,
): void {
  const live = connected.get(el) ?? new Map<string, AbortController>()
  if (live.get(name)?.signal.aborted === false) return
  const controller = childOf(signal)
  if (!tryConnect(el, name, registry, controller)) return
  connected.set(el, live.set(name, controller))
}

/**
 * A panel that throws (a bad param, the wrong element) is reported as an
 * uncaught error naming it, what it had already added ends with its
 * controller, and the other panels of the page still connect.
 */
function tryConnect(
  el: Element,
  name: string,
  registry: Registry,
  controller: AbortController,
): boolean {
  try {
    const run = { signal: controller.signal }
    panelNamed(registry, name, el).fromMarkup(el, name, run)
    return true
  } catch (error) {
    controller.abort(error)
    reportError(error)
    return false
  }
}

function panelNamed(registry: Registry, name: string, el: Element) {
  const found = registry[name]
  if (found) return found
  throw new Error(
    `panel: <${el.localName} data-panel="${name}"> names no panel in the registry`,
  )
}

function childOf(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal.aborted) controller.abort(signal.reason)
  signal.addEventListener('abort', () => controller.abort(signal.reason), {
    once: true,
    signal: controller.signal,
  })
  return controller
}

/** For `observe`: the panels of a removed element (and inside it) end. */
export function detach(root: Element): void {
  for (const el of [root, ...root.querySelectorAll(`[${PANEL_ATTRIBUTE}]`)])
    for (const controller of connected.get(el)?.values() ?? [])
      controller.abort()
}
