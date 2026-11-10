import type { Easing } from './easing'

/** One stop of CSS `linear()`: an output value, at an input (0–1) or not. */
export interface LinearStop {
  value: number
  at?: number
}

interface Point {
  value: number
  at: number
}

/**
 * CSS `linear(…)` as an easing: straight lines between stops (CSS Easing
 * Functions Level 2, "linear easing function"). Stops without an input
 * are spread evenly between their neighbours; an input lower than one
 * before it is raised to it; before the first and after the last stop the
 * line keeps its slope.
 *
 *   const hop = linearPoints([{ value: 0 }, { value: 1, at: 0.25 }, { value: 1 }])
 *   hop(0.125) // 0.5
 */
export function linearPoints(stops: LinearStop[]): Easing {
  if (stops.length < 2) {
    throw new RangeError('theater: linear() needs at least two stops')
  }
  const points = spread(raise(withEnds(stops)))
  return (t) => along(points, t)
}

/** The first stop is at 0 and the last at 1 unless they say otherwise. */
function withEnds(stops: LinearStop[]): LinearStop[] {
  const last = stops.length - 1
  return stops.map((stop, i) =>
    stop.at === undefined && (i === 0 || i === last)
      ? { ...stop, at: i === 0 ? 0 : 1 }
      : stop,
  )
}

/** An input lower than the largest before it is raised to that one. */
function raise(stops: LinearStop[]): LinearStop[] {
  let largest = -Infinity
  return stops.map((stop) => {
    if (stop.at === undefined) return stop
    largest = Math.max(largest, stop.at)
    return { ...stop, at: largest }
  })
}

/** Runs of stops without an input share the gap between their neighbours. */
function spread(stops: LinearStop[]): Point[] {
  return stops.map((stop, i) =>
    stop.at === undefined
      ? { value: stop.value, at: between(stops, i) }
      : (stop as Point),
  )
}

function between(stops: LinearStop[], i: number): number {
  const before = stops.findLastIndex((s, j) => j < i && s.at !== undefined)
  const after = stops.findIndex((s, j) => j > i && s.at !== undefined)
  const [from, to] = [stops[before]!.at!, stops[after]!.at!]
  return from + ((to - from) * (i - before)) / (after - before)
}

/**
 * The line through the segment that holds `t`: from the last stop at or
 * before it (the first stop when `t` is before them all) to the next one
 * (the last two when `t` is after them all). Two stops at one input are a
 * jump: the later value wins, as the spec says.
 */
function along(points: Point[], t: number): number {
  const i = segmentOf(points, t)
  const [a, b] = [points[i]!, points[i + 1]!]
  if (b.at === a.at) return b.value
  return a.value + ((b.value - a.value) * (t - a.at)) / (b.at - a.at)
}

function segmentOf(points: Point[], t: number): number {
  const last = points.length - 2
  const i = points.findLastIndex((p, j) => j <= last && p.at <= t)
  return Math.max(0, i)
}
