import type { AnimateOptions } from '../../shared/theater/options'
import { curveTiming } from './element'
import { measure, flip } from './layout'
import { reducedMotion } from './reduce'
import { speedOf } from './speed'

/** A change to show: a function (sync or async), or a transition already started. */
export type ViewChange = (() => unknown) | ViewTransition

/** The animations a View Transition runs, on its `::view-transition-*` pseudo-elements. */
function partsOf(): Animation[] {
  return document.getAnimations().filter((animation) => {
    const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement
    return pseudo?.startsWith('::view-transition') ?? false
  })
}

/** Did the options choose a curve? If not, the site's CSS keeps its own. */
function choseCurve(options: AnimateOptions): boolean {
  const { duration, easing, spring } = options
  return duration !== undefined || easing !== undefined || spring !== undefined
}

/**
 * Gives a View Transition theater's curve and the page's speed
 * once its pseudo-elements exist (`ready`), then waits for the end.
 * Success is the change having run (`updateCallbackDone`): a skipped
 * transition (a hidden tab, a newer one) never gets `ready`, yet the
 * change happened — as settle's rule says, cancelled counts as finished.
 */
async function shape(
  transition: ViewTransition,
  options: AnimateOptions,
): Promise<void> {
  markHandled(transition)
  const timed = transition.ready.then(
    () => giveTiming(options),
    countsAsFinished,
  )
  await transition.updateCallbackDone // rejects only with the change's own error
  await timed
  await transition.finished
}

/** A transition's promises reject together when the change fails; one rejection is enough. */
function markHandled(transition: ViewTransition): void {
  const { updateCallbackDone, finished } = transition // `ready` is handled where `shape` waits on it
  for (const promise of [updateCallbackDone, finished])
    promise.catch(countsAsFinished)
}

/**
 * Skipped, cancelled, or a failed change already told through
 * `updateCallbackDone`: nothing to do (settle's rule).
 */
function countsAsFinished(): void {}

/** The transition's animations get theater's timing, at the page's speed. */
function giveTiming(options: AnimateOptions): void {
  const speed = speedOf(document.documentElement)
  const chosen = choseCurve(options)
  const timing = chosen ? curveTiming(options, speed) : {}
  for (const part of partsOf()) {
    part.effect?.updateTiming(timing as OptionalEffectTiming)
    part.playbackRate = chosen ? 1 : speed
  }
}

/** Every element the page names for a View Transition, by name. */
function named(): Map<string, Element> {
  const found = new Map<string, Element>()
  for (const el of document.querySelectorAll('*')) {
    const name = getComputedStyle(el).viewTransitionName
    if (name && name !== 'none') found.set(name, el)
  }
  return found
}

/**
 * Module-level on purpose: a browser that can't read the names is said
 * once per page, not on every change.
 */
let toldNoNames = false

/**
 * Without View Transitions a browser most likely can't read
 * `view-transition-name` either: nothing would be shared, so it is
 * reported (once) rather than silently animating nothing.
 */
function tellIfNoNames(): void {
  if (toldNoNames || CSS.supports('view-transition-name', 'none')) return
  toldNoNames = true
  reportError(
    new Error(
      'theater: animateView: this browser has neither View Transitions nor `view-transition-name`, so no element is shared; the change happens without motion',
    ),
  )
}

/**
 * Without View Transitions: the change, then FLIP for each name —
 * the new element with a name starts from where the old one with that
 * name was. A FLIP its signal stopped counts as finished: the
 * change ran (settle's rule).
 */
async function flipByName(
  change: () => unknown,
  options: AnimateOptions,
): Promise<void> {
  tellIfNoNames()
  const before = named()
  const { boxes } = measure(before.values())
  await change()
  const moved = movedByName(before, boxes, named())
  await flip({ boxes: moved }, options).finished.catch(countsAsFinished)
}

/** Each name's new element, with the box its old one had. */
function movedByName(
  before: Map<string, Element>,
  boxes: ReadonlyMap<Element, DOMRect>,
  after: Map<string, Element>,
): Map<Element, DOMRect> {
  const moved = [...before].flatMap(([name, old]) => {
    const now = after.get(name)
    return now ? [[now, boxes.get(old)!] as const] : []
  })
  return new Map(moved)
}

/**
 * Shows a change as a View Transition: shared elements are the
 * ones with the same `view-transition-name` before and after. theater
 * gives it its curve and the page's speed. Where there are no View
 * Transitions, the named elements FLIP instead. Under reduced
 * motion the change just happens (shared elements move). Pass a
 * transition already started (bridge's) to shape it.
 *
 *   await animateView(() => showDetail(game), { spring: { duration: 500, bounce: 0.15 } })
 */
export async function animateView(
  change: ViewChange,
  options: AnimateOptions = {},
): Promise<void> {
  if (typeof change !== 'function') return shape(change, options)
  if (reducedMotion() && options.reduce !== false) return void (await change())
  if (!document.startViewTransition) return flipByName(change, options)
  return shape(
    document.startViewTransition(change as () => Promise<void>),
    options,
  )
}
