import { TOP } from '../../shared/bridge/vocabulary'
import { HeadMerge } from './head'
import type { Loaded } from './loader'
import type { Prepared, Swapper } from './swapper'

/**
 * The response goes in as the whole page (`data-bridge-target="_top"`, or
 * the landing of a response that had no segments to swap): the head
 * merged, the root's attributes and the body replaced, nothing executed.
 * A tracked asset that changed (a deploy) means the page comes the
 * browser's way instead. Nowhere further to land: the browser is next.
 */
export class WholePage implements Swapper {
  readonly targets = [TOP]

  segments(): string[] {
    return []
  }

  busy(): Element[] {
    return [document.documentElement]
  }

  prepare(loaded: Loaded): Prepared {
    const head = new HeadMerge(loaded.page)
    return {
      outdated: head.trackedChanged(),
      ready: (signal) => head.loadStyles(signal),
      apply: () => [replace(loaded.page, head)],
    }
  }

  landing(): null {
    return null
  }
}

/** The new document takes over: root attributes, head (merged) and body, which is the new element. */
function replace(page: Document, head: HeadMerge): Element {
  const root = document.documentElement
  for (const { name } of [...root.attributes]) root.removeAttribute(name)
  for (const { name, value } of page.documentElement.attributes)
    root.setAttribute(name, value)
  head.apply()
  const body = document.adoptNode(page.body)
  document.body.replaceWith(body)
  return body
}
