import { ATTRIBUTE_PREFIX } from '../../shared/bridge/vocabulary'
import { SEGMENT_ATTRIBUTE } from '../../shared/markup/vocabulary'

/**
 * The one inheritance rule for every bridge attribute: an element's value
 * is its own, else the closest ancestor's. `data-bridge-transition="true"`
 * on `<html>` turns transitions on everywhere; `"false"` on a section turns
 * them off below it.
 */
export function inherited(element: Element, role: string): string | null {
  const name = `${ATTRIBUTE_PREFIX}${role}`
  return element.closest(`[${name}]`)?.getAttribute(name) ?? null
}

/** The name of the segment `element` sits in, or null outside every segment. */
export function enclosingSegment(element: Element): string | null {
  return (
    element
      .closest(`[${SEGMENT_ATTRIBUTE}]`)
      ?.getAttribute(SEGMENT_ATTRIBUTE) ?? null
  )
}

/** The segment called `name` in `root`. */
export function segmentIn(root: ParentNode, name: string): Element | null {
  return root.querySelector(`[${SEGMENT_ATTRIBUTE}="${CSS.escape(name)}"]`)
}
