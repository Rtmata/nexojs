/** A delay per element of a list: its place in the list, and the list's size. */
export type StaggerDelay = (index: number, count: number) => number

/** Where the stagger starts counting from. */
export type StaggerFrom = 'first' | 'last' | 'center' | 'edges' | number

export interface StaggerOptions {
  /** Added to every delay, in ms. */
  start?: number
  /** Which element goes first. `first` by default. */
  from?: StaggerFrom
}

/**
 * Each element of a list starts `each` ms after the one before it (B.2),
 * counting from `from`. Pass it as `delay` to an animation of a list.
 *
 *   animate(covers, { opacity: [0, 1] }, { delay: stagger(50, { from: 'center' }) })
 */
export function stagger(
  each: number,
  options: StaggerOptions = {},
): StaggerDelay {
  const from = options.from ?? 'first'
  const start = options.start ?? 0
  return (index, count) => start + each * distance(index, count, from)
}

/** How many places from where the stagger starts. */
function distance(index: number, count: number, from: StaggerFrom): number {
  const last = count - 1
  if (typeof from === 'number') return Math.abs(index - from)
  if (from === 'last') return last - index
  if (from === 'center') return Math.abs(index - last / 2)
  if (from === 'edges') return Math.min(index, last - index)
  return index
}
