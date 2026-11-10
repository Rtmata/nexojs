import { settled } from '../settle/settle'

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
 * `done`, or the signal's abort if that comes first. The abort listener
 * goes either way: a long-lived signal must not keep every wait alive.
 */
function untilAborted(
  done: Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  const listening = new AbortController()
  const aborted = new Promise<void>((stop) =>
    signal?.addEventListener('abort', () => stop(), {
      once: true,
      signal: listening.signal,
    }),
  )
  return Promise.race([done, aborted]).finally(() => listening.abort())
}

/**
 * Waits for an element's animations — CSS and WAAPI — to end (C.2): all
 * of them, or the one `name`d. A cancelled animation counts as ended; one
 * that never ends is let go after a fallback (the longest left plus
 * 500 ms, endless ones 4 s, C.15c). With nothing to wait for (reduced
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
    : all
  const done = settled(animations) ?? Promise.resolve()
  return untilAborted(done, options.signal)
}
