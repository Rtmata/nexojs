import { RawHtml, type Child } from './element'

/**
 * The one rule for leaves — children with no children of their own — used
 * by the renderer, by slots and by <script>/<style> text alike.
 */

/** What renders nothing: `null`, `undefined`, `true`, `false` and `''`. */
export function isNothing(child: Child): boolean {
  return (
    child === null ||
    child === undefined ||
    typeof child === 'boolean' ||
    child === ''
  )
}

/** The text of a text leaf (a string or a number), not escaped; else `undefined`. */
export function textOf(child: Child): string | undefined {
  if (typeof child === 'string') return child
  if (typeof child === 'number' || typeof child === 'bigint')
    return String(child)
  return undefined
}

/** The HTML of trusted markup made with `raw()`; else `undefined`. */
export function rawOf(child: Child): string | undefined {
  return child instanceof RawHtml ? child.html : undefined
}
