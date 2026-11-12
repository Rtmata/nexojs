/**
 * What bridge tells the page, as DOM events that bubble, so
 * `document.addEventListener` hears them all. `bridge:fetch`, `bridge:swap`
 * and `bridge:fail` fire on the link that started the navigation;
 * `bridge:swapped` on each segment that just arrived, with its lifetime in
 * `detail.signal`; `bridge:leave` on each one about to go, whose listeners
 * may hand `detail.waitUntil(promise)` their exits. Cancelling
 * `bridge:fetch` or `bridge:swap` with `preventDefault()` stops bridge
 * there; the handler owns what happens next (`detail.swap()` does the swap).
 * `bridge:fail` carries the `error` and, once a response arrived, its
 * `page`, final `url` and `status`; cancelling it leaves the page as it is.
 */
export type EventName =
  | 'bridge:fetch'
  | 'bridge:swap'
  | 'bridge:swapped'
  | 'bridge:leave'
  | 'bridge:fail'
  | 'bridge:cancel'
  | 'bridge:transition'

/** Dispatches the event; false when a listener cancelled it. */
export function announce(
  from: Element,
  name: EventName,
  detail: object,
): boolean {
  return from.dispatchEvent(
    new CustomEvent(name, { detail, bubbles: true, cancelable: true }),
  )
}
