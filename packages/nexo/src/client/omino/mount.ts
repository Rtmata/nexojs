import type { Child } from '../../shared/omino/element'
import type { RenderContext } from '../../shared/omino/render'
import { DomBuilder, HTML } from './builder'
import { InsertedPhase, Life } from './life'
import type { Reactivity } from './reactivity'

export interface MountOptions {
  /** Its lifetime (B.8): aborting it ends every component and removes the content. */
  signal: AbortSignal
  /** The signals library, as a value (R.12): `import * as connector from '@nexoamigos/nexo/connector'`. */
  reactivity: Reactivity
  /** What every `template(context)` receives, as on the server's `render()`. */
  context?: RenderContext
}

/**
 * Build a tree into `el`, replacing its content (C.19a). When this returns,
 * the DOM is complete (R.15); `mounted` and `ref` have run, children first.
 *
 *   mount(<Gallery shots={shots} />, el, { signal, reactivity: connector })
 */
export function mount(tree: Child, el: Element, options: MountOptions): void {
  const life = new Life(options.signal)
  const phase = new InsertedPhase()
  const builder = new DomBuilder(options.reactivity, options.context ?? {})
  const scope = { children: undefined }
  const nodes = builder.build(tree, { life, phase, scope, ns: namespaceOf(el) })
  replaceContent(el, nodes, life.signal)
  phase.release()
}

/** Between two markers, so leaving removes what regions placed later too. */
function replaceContent(el: Element, nodes: Node[], signal: AbortSignal): void {
  const start = document.createComment('')
  const end = document.createComment('')
  el.replaceChildren(start, ...nodes, end)
  const leave = () => removeBetween(start, end)
  signal.addEventListener('abort', leave, { once: true })
}

function namespaceOf(el: Element): string {
  return el.localName === 'foreignObject' ? HTML : (el.namespaceURI ?? HTML)
}

/** Everything the mount placed, also what regions placed later. */
function removeBetween(start: Comment, end: Comment): void {
  while (start.nextSibling && start.nextSibling !== end)
    start.nextSibling.remove()
  start.remove()
  end.remove()
}
