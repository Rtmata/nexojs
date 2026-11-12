/**
 * The named parts of a view timeline (Scroll-driven Animations): `cover`
 * from the subject's first pixel entering to its last leaving, `contain`
 * while it is fully inside (or fully covers), `entry` and `exit` the edges.
 */
export type RangeName = 'cover' | 'contain' | 'entry' | 'exit'

/** A point of a range: `'entry 0%'`, `'cover 50%'`, or just `'50%'` (of cover). */
export interface RangePoint {
  name: RangeName
  fraction: number
}

/** Where the subject is and how big things are, along the scroll axis. */
export interface ViewGeometry {
  /** The subject's start in the scroller's content, in px. */
  subjectStart: number
  /** The subject's size, in px. */
  subjectSize: number
  /** The scroller's visible size, in px. */
  viewport: number
}

const NAMES = new Set<RangeName>(['cover', 'contain', 'entry', 'exit'])

/**
 * Reads `'entry 25%'`, `'cover 0%'` or `'50%'` (cover).
 *
 *   rangePoint('entry 25%') // { name: 'entry', fraction: 0.25 }
 */
export function rangePoint(text: string): RangePoint {
  const [first, second] = text.trim().split(/\s+/)
  const named = NAMES.has(first as RangeName)
  const percent = named ? second : first
  const name = (named ? first : 'cover') as RangeName
  if (percent?.endsWith('%'))
    return { name, fraction: Number(percent.slice(0, -1)) / 100 }
  throw new SyntaxError(
    `theater: a range point is a name and a percentage, like "entry 0%" or "cover 50%", got "${text}"`,
  )
}

/** The scroll positions (px) where a named range starts and ends. */
function bounds(name: RangeName, view: ViewGeometry): [number, number] {
  const { subjectStart: top, subjectSize: size, viewport } = view
  const coverStart = top - viewport
  const coverEnd = top + size
  const containStart = Math.min(top + size - viewport, top)
  const containEnd = Math.max(top, top + size - viewport)
  if (name === 'cover') return [coverStart, coverEnd]
  if (name === 'contain') return [containStart, containEnd]
  if (name === 'entry') return [coverStart, containStart]
  return [containEnd, coverEnd]
}

/** The scroll position (px) of a point of a range. */
export function positionOf(point: RangePoint, view: ViewGeometry): number {
  const [start, end] = bounds(point.name, view)
  return start + (end - start) * point.fraction
}

/**
 * How far through `[from, to]` the scroll is, 0 to 1 (clamped), for a
 * view timeline: the fallback where the browser has none.
 *
 *   viewProgress(700, geometry, rangePoint('cover 0%'), rangePoint('cover 100%'))
 */
export function viewProgress(
  scroll: number,
  view: ViewGeometry,
  from: RangePoint,
  to: RangePoint,
): number {
  const [start, end] = [positionOf(from, view), positionOf(to, view)]
  if (end === start) return scroll >= end ? 1 : 0
  return Math.min(Math.max((scroll - start) / (end - start), 0), 1)
}

/** How far a scroller is scrolled, 0 to 1: a scroll timeline's progress. */
export function scrollProgress(
  scroll: number,
  scrollSize: number,
  viewport: number,
): number {
  const room = scrollSize - viewport
  if (room <= 0) return 1
  return Math.min(Math.max(scroll / room, 0), 1)
}
