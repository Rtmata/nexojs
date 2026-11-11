/**
 * WCAG 2.3.1's counter (C.3), the one concept both sources feed: a
 * region's colour over time in, flashes per second out. Definitions from
 * WCAG 2.2's glossary ("general flash and red flash thresholds").
 */

/** One moment of a region: when (ms), and its colour (sRGB, 0–255). */
export interface ColorSample {
  t: number
  r: number
  g: number
  b: number
}

/** sRGB channel to linear light (WCAG 2.2's relative luminance). */
function linear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG's relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }: Omit<ColorSample, 't'>): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** CIE 1976 UCS chromaticity (u′, v′) of an sRGB colour. */
function chromaticity({ r, g, b }: Omit<ColorSample, 't'>): [number, number] {
  const [R, G, B] = [linear(r), linear(g), linear(b)]
  const X = 0.4124 * R + 0.3576 * G + 0.1805 * B
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const Z = 0.0193 * R + 0.1192 * G + 0.9505 * B
  const d = X + 15 * Y + 3 * Z
  return d === 0 ? [0, 0] : [(4 * X) / d, (9 * Y) / d]
}

/** Saturated red (Note 3): R / (R + G + B) ≥ 0.8. */
function saturatedRed({ r, g, b }: Omit<ColorSample, 't'>): boolean {
  const sum = r + g + b
  return sum > 0 && r / sum >= 0.8
}

/** Which transitions a change between two colours makes: one, both (black to red) or none. */
interface Change {
  general: boolean
  red: boolean
}

/**
 * General: luminance changes by 10 % of the maximum or more, the darker
 * state under 0.80. Red: one side saturated red and the chromaticity
 * moving by more than 0.2. Judged apart, as WCAG defines them apart.
 */
function changeBetween(a: ColorSample, b: ColorSample): Change {
  const [la, lb] = [luminance(a), luminance(b)]
  const [ua, va] = chromaticity(a)
  const [ub, vb] = chromaticity(b)
  const moved = Math.hypot(ua - ub, va - vb) > 0.2
  return {
    general: Math.abs(la - lb) >= 0.1 && Math.min(la, lb) < 0.8,
    red: moved && (saturatedRed(a) || saturatedRed(b)),
  }
}

/** One counted transition: when, whether it is red, and which way (up or down in luminance). */
interface Transition {
  t: number
  red: boolean
  up: boolean
}

/**
 * Finds transitions between turning points. A change is measured from
 * the real turning point — the darkest colour since the last transition
 * down, the brightest since the last one up — so a wave whose samples
 * never sit on its peaks still counts. Changes on in the same direction
 * are the same transition (a gradual ramp is one change, not many).
 */
class Transitions {
  readonly found: Transition[] = []
  private darkest: ColorSample
  private brightest: ColorSample

  constructor(first: ColorSample) {
    this.darkest = this.brightest = first
  }

  /** Takes the next sample; counts a transition when it makes one. */
  add(sample: ColorSample): void {
    this.widen(sample)
    const transition = this.transitionTo(sample)
    if (transition) this.count(transition, sample)
  }

  private widen(sample: ColorSample): void {
    if (luminance(sample) < luminance(this.darkest)) this.darkest = sample
    if (luminance(sample) > luminance(this.brightest)) this.brightest = sample
  }

  /** The transition `sample` ends, if any: up from the darkest unless the last went up, else down from the brightest. */
  private transitionTo(sample: ColorSample): Transition | null {
    const last = this.found.at(-1)?.up
    const up = last === true ? null : this.between(this.darkest, sample, true)
    if (up || last === false) return up
    return this.between(this.brightest, sample, false)
  }

  private between(
    turn: ColorSample,
    sample: ColorSample,
    up: boolean,
  ): Transition | null {
    const change = changeBetween(turn, sample)
    if (!change.general && !change.red) return null
    return { t: sample.t, red: change.red, up }
  }

  /** The sample that ends a transition is where the next one is measured from. */
  private count(transition: Transition, sample: ColorSample): void {
    this.found.push(transition)
    this.darkest = this.brightest = sample
  }
}

function transitionsOf(samples: ColorSample[]): Transition[] {
  const transitions = new Transitions(samples[0]!)
  for (const sample of samples.slice(1)) transitions.add(sample)
  return transitions.found
}

/** WCAG 2.3.1: more flashes than this in any one second fails. */
export const FLASH_LIMIT = 3

/** What the counter says about one region. */
export interface FlashCount {
  /** The most flashes in any one-second window. */
  perSecond: number
  /** Any red flash among them. */
  red: boolean
}

/**
 * The most flashes in any one-second window: a flash is a pair of
 * opposing transitions (WCAG 2.2). More than three fails 2.3.1 unless the
 * area is small enough.
 *
 *   countFlashes(samples).perSecond // 5 → fails
 */
export function countFlashes(samples: ColorSample[]): FlashCount {
  const transitions = transitionsOf(samples)
  let most = 0
  for (const first of transitions) {
    const inWindow = transitions.filter(
      (t) => t.t >= first.t && t.t < first.t + 1000,
    )
    most = Math.max(most, pairs(inWindow))
  }
  return { perSecond: most, red: transitions.some((t) => t.red) }
}

/** Opposing transitions taken two by two. */
function pairs(transitions: Transition[]): number {
  let count = 0
  for (let i = 1; i < transitions.length; i++) {
    if (transitions[i]!.up !== transitions[i - 1]!.up) (count++, i++)
  }
  return count
}

/** The area WCAG lets flash: a 341 × 256 rectangle at 1024 × 768 (Note 1), as a share of the viewport. */
export const SAFE_AREA_SHARE = (341 * 256) / (1024 * 768)
