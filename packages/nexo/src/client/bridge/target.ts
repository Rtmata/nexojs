import { splitNames } from '../../shared/bridge/segment-url'
import { NONE as NONE_VALUE, TOP } from '../../shared/bridge/vocabulary'

/**
 * What a link should replace, read from `data-bridge-target`:
 * segment names (`"shelf"`, `"shelf, counter"`), `_top` for the whole page,
 * `_none` to leave the link to the browser. Without the attribute, the
 * segment the link sits in; outside every segment, the browser.
 */
export type Target =
  { kind: 'segments'; names: string[] } | { kind: 'top' } | { kind: 'none' }

export function targetOf(
  attribute: string | null,
  enclosing: string | null,
): Target {
  if (attribute === null) return enclosing ? segments([enclosing]) : NONE
  if (attribute.trim() === TOP) return { kind: 'top' }
  if (attribute.trim() === NONE_VALUE) return NONE
  return segments(splitNames(attribute))
}

const NONE: Target = { kind: 'none' }

function segments(names: string[]): Target {
  return names.length ? { kind: 'segments', names } : NONE
}
