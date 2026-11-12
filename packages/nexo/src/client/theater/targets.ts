/** What an element animation moves: one element, or a list of them. */
export type Targets = Element | Iterable<Element>

/**
 * The elements to animate, as an array. A selector string is refused:
 * "search from which root?" would be a hidden rule.
 */
export function listOf(targets: Targets): Element[] {
  if (targets instanceof Element) return [targets]
  if (typeof targets === 'string' || !(Symbol.iterator in Object(targets))) {
    throw new TypeError(
      'theater: animate takes an element, a list of elements, or numbers and a function (no selector strings: use querySelectorAll)',
    )
  }
  return [...targets]
}
