import { fromCss } from '../../shared/theater/easing/css'
import {
  countFlashes,
  SAFE_AREA_SHARE,
  type ColorSample,
} from '../../shared/theater/flash-counter'

/** What the predicted source says about one animated element. */
export interface PredictedFlash {
  element: Element
  /** The most flashes in any second. */
  perSecond: number
  red: boolean
  /** Its share of the viewport. */
  area: number
  /** More than three a second, on more than the safe area (WCAG 2.3.1). */
  fails: boolean
}

type RGB = Omit<ColorSample, 't'>

const SAMPLES_PER_SECOND = 60
const SECONDS = 2

/** A CSS colour as sRGB numbers, read by the browser itself (a canvas normalizes it). */
function rgbOf(color: string): RGB {
  const context = new OffscreenCanvas(1, 1).getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return { r: r!, g: g!, b: b! }
}

function mix(a: RGB, b: RGB, share: number): RGB {
  const at = (x: number, y: number) => x + (y - x) * share
  return { r: at(a.r, b.r), g: at(a.g, b.g), b: at(a.b, b.b) }
}

/** The colour a keyframe shows: its background (or text) colour, faded by its opacity over the page. */
function colorOf(frame: ComputedKeyframe, base: RGB, page: RGB): RGB {
  const own = frame.backgroundColor ?? frame.color
  const color = typeof own === 'string' ? rgbOf(own) : base
  const opacity = frame.opacity === undefined ? 1 : Number(frame.opacity)
  return mix(page, color, opacity)
}

/** Where the effect is at `ms` of the wall clock, as progress through its keyframes. */
function progressAt(effect: KeyframeEffect, ms: number): number {
  const { duration, iterations, direction, easing } = effect.getComputedTiming()
  const length = Number(duration)
  if (!length) return 1
  const iteration = Math.min(Math.floor(ms / length), Number(iterations) - 1)
  const within = Math.min(ms - iteration * length, length) / length
  const reversed = backwards(direction ?? 'normal', iteration)
  return fromCss(easing ?? 'linear')(reversed ? 1 - within : within)
}

function backwards(direction: PlaybackDirection, iteration: number): boolean {
  const odd = iteration % 2 === 1
  if (direction === 'reverse') return true
  if (direction === 'alternate') return odd
  return direction === 'alternate-reverse' && !odd
}

/** The keyframes' colours, and the colour at a progress between two of them. */
function colorAt(
  frames: ComputedKeyframe[],
  colors: RGB[],
  progress: number,
): RGB {
  const offset = (i: number) => frames[i]!.computedOffset ?? 0
  const i = Math.max(
    0,
    frames.findLastIndex((_, k) => offset(k) <= progress),
  )
  const next = Math.min(i + 1, frames.length - 1)
  const span = offset(next) - offset(i)
  const linearShare = span === 0 ? 0 : (progress - offset(i)) / span
  const share = fromCss(frames[i]!.easing ?? 'linear')(linearShare) // a keyframe's own easing (steps…)
  return mix(colors[i]!, colors[next]!, share)
}

/** Two seconds of the animation's colour, sampled at 60 fps, as the counter takes it. */
function samplesOf(
  effect: KeyframeEffect,
  base: RGB,
  page: RGB,
): ColorSample[] {
  const frames = effect.getKeyframes()
  const colors = frames.map((frame) => colorOf(frame, base, page))
  return Array.from({ length: SAMPLES_PER_SECOND * SECONDS }, (_, i) => {
    const t = (i * 1000) / SAMPLES_PER_SECOND
    return { t, ...colorAt(frames, colors, progressAt(effect, t)) }
  })
}

/** An animated element's verdict. */
function predict(animation: Animation, page: RGB): PredictedFlash | null {
  const effect = animation.effect
  if (!(effect instanceof KeyframeEffect) || !effect.target) return null
  const element = effect.target
  const base = rgbOf(getComputedStyle(element).backgroundColor)
  const counted = countFlashes(samplesOf(effect, base, page))
  const area = shareOf(element)
  const fails = counted.perSecond > 3 && area > SAFE_AREA_SHARE
  return { element, ...counted, area, fails }
}

/** The element's share of the viewport. */
function shareOf(element: Element): number {
  const box = element.getBoundingClientRect()
  return (box.width * box.height) / (innerWidth * innerHeight)
}

/**
 * The predicted source of the flash checker (C.3): from the keyframes of
 * the animations running in `root` — their background or text colour and
 * opacity, their timing and easing — the flashes each would make, counted
 * by WCAG 2.3.1's rule. Cheap enough for development; it can't see
 * images, video or canvas (the measured source can).
 *
 *   predictFlashes().filter((f) => f.fails)
 */
export function predictFlashes(root: ParentNode = document): PredictedFlash[] {
  const page = rgbOf(getComputedStyle(document.body).backgroundColor || 'white')
  const inRoot = (a: Animation) => {
    const target = (a.effect as KeyframeEffect | null)?.target
    return target ? root.contains(target) : false
  }
  const found = document
    .getAnimations()
    .filter(inRoot)
    .map((a) => predict(a, page))
  return found.filter((f): f is PredictedFlash => f !== null)
}
