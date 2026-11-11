import { untilAborted } from '../settle/abort'
import { ending, settled } from '../settle/settle'

export interface FinishedOptions {
  /** Only this CSS animation (`animation-name`) or transition (its property). */
  name?: string
  /** Its descendants' animations too. */
  subtree?: boolean
  /** Stops waiting; the promise then resolves (nothing more to wait for). */
  signal?: AbortSignal
}

/** The CSS animation's name or the transition's property; WAAPI ones have neither. */
function nameOf(animation: Animation): string | undefined {
  if (animation instanceof CSSAnimation) return animation.animationName
  if (animation instanceof CSSTransition) return animation.transitionProperty
  return undefined
}

/**
 * Waits for an element's animations — CSS and WAAPI — to end (C.2): all
 * of them, or the one `name`d. A cancelled animation counts as ended. An
 * endless one is not waited for (a spinner is no exit), unless it is the
 * one `name`d: then it is let go after 4 s (C.15c); a finite one after
 * the longest left plus 500 ms. With nothing to wait for (reduced
 * motion removed it) it resolves at once.
 *
 *   await finished(page, { name: 'page-turn', signal })
 */
export function finished(
  el: Element,
  options: FinishedOptions = {},
): Promise<void> {
  const all = el.getAnimations({ subtree: options.subtree ?? false })
  const animations = options.name
    ? all.filter((a) => nameOf(a) === options.name)
    : ending(all)
  const done = settled(animations) ?? Promise.resolve()
  return untilAborted(done, options.signal)
}
