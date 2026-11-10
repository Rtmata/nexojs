/** Where a pointer was, and when (ms). */
export interface Sample {
  t: number
  x: number
  y: number
}

/** Android's VelocityTracker window: the last 100 ms count. */
const WINDOW = 100
/** A pointer still for this long has no speed left. */
const STILL = 40

/**
 * px/s along one axis (F.1): a least-squares line over the last 100 ms
 * of samples; none if the pointer stood still. The one velocity estimate
 * in Nexo — panel's `gesture`, theater's `drag` and `pinch` read it.
 *
 *   speed(samples, 'x') // 1800
 */
export function speed(samples: Sample[], axis: 'x' | 'y'): number {
  const recent = recentOf(samples)
  const [previous, last] = [recent.at(-2), recent.at(-1)]
  if (!previous || !last || last.t - previous.t > STILL) return 0
  return slope(recent.map((s) => [s.t, s[axis]] as const)) * 1000
}

/**
 * The samples `speed` reads: the last 100 ms. A tracker keeps only these,
 * so a long press doesn't grow its list for nothing.
 *
 *   samples = recentOf([...samples, next])
 */
export function recentOf(samples: Sample[]): Sample[] {
  const last = samples.at(-1)
  if (!last) return []
  return samples.filter((s) => last.t - s.t <= WINDOW)
}

function slope(points: readonly (readonly [number, number])[]): number {
  const mean = (i: 0 | 1) =>
    points.reduce((sum, p) => sum + p[i], 0) / points.length
  const [mt, mv] = [mean(0), mean(1)]
  const covariance = points.reduce(
    (sum, [t, v]) => sum + (t - mt) * (v - mv),
    0,
  )
  const variance = points.reduce((sum, [t]) => sum + (t - mt) ** 2, 0)
  return variance === 0 ? 0 : covariance / variance
}
