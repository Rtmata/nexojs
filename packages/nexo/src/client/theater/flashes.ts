import { fromCss } from '../../shared/theater/easing/css'
import {
  countFlashes,
  FLASH_LIMIT,
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

const WHITE: RGB = { r: 255, g: 255, b: 255 }

/**
 * Reads CSS colours with the browser's own parser: a canvas takes any
 * colour CSS does, with its alpha, and keeps its old one when given
 * something else (`var(--x)`), which is how a value that isn't a colour
 * is told apart.
 */
class ColorReader {
  private readonly context = new OffscreenCanvas(1, 1).getContext('2d', {
    willReadFrequently: true,
  })!

  /** `color` composited over `under`; null when it isn't a colour. */
  over(color: string, under: RGB): RGB | null {
    if (!this.isColor(color)) return null
    const [r = 0, g = 0, b = 0, alpha = 0] = this.pixelOf(color)
    return mix(under, { r, g, b }, alpha / 255)
  }

  private isColor(color: string): boolean {
    return this.styleAfter('#000', color) === this.styleAfter('#fff', color)
  }

  private styleAfter(before: string, color: string): string {
    this.context.fillStyle = before
    this.context.fillStyle = color
    return String(this.context.fillStyle)
  }

  private pixelOf(color: string): Uint8ClampedArray {
    this.context.clearRect(0, 0, 1, 1)
    this.context.fillStyle = color
    this.context.fillRect(0, 0, 1, 1)
    return this.context.getImageData(0, 0, 1, 1).data
  }
}

function mix(a: RGB, b: RGB, share: number): RGB {
  const at = (x: number, y: number) => x + (y - x) * share
  return { r: at(a.r, b.r), g: at(a.g, b.g), b: at(a.b, b.b) }
}

/**
 * The colours behind one element's animation: the page under it (the
 * body's background over the root's, over the canvas's white) and its own
 * background over that, what a keyframe without a colour shows.
 */
class Backdrop {
  readonly base: RGB

  constructor(
    private readonly reader: ColorReader,
    private readonly style: CSSStyleDeclaration,
    readonly page: RGB,
  ) {
    this.base = reader.over(style.backgroundColor, page) ?? page // computed: always a colour
  }

  /** The page behind everything (computed colours always read; the fallbacks only satisfy the type). */
  static pageOf(reader: ColorReader): RGB {
    const style = (el: Element) => getComputedStyle(el).backgroundColor
    const root = reader.over(style(document.documentElement), WHITE) ?? WHITE
    return reader.over(style(document.body), root) ?? root
  }

  /**
   * A keyframe's colour over the page. `currentcolor` is the element's
   * text colour (the canvas would read it as black); a value that isn't a
   * colour is reported and the element's own background used, as WAAPI
   * ignores it.
   */
  shown(color: string): RGB {
    const own = /^currentcolor$/i.test(color) ? this.style.color : color
    const shown = this.reader.over(own, this.page)
    if (shown) return shown
    reportError(
      new TypeError(
        `theater: predictFlashes: ${color} is not a colour; the element's background is used`,
      ),
    )
    return this.base
  }
}

/** The colour a keyframe shows: its background (or text) colour, faded by its opacity over the page. */
function colorOf(frame: ComputedKeyframe, backdrop: Backdrop): RGB {
  const own = frame.backgroundColor ?? frame.color
  const color = typeof own === 'string' ? backdrop.shown(own) : backdrop.base
  const opacity = frame.opacity === undefined ? 1 : Number(frame.opacity)
  return mix(backdrop.page, color, opacity)
}

/** Where the effect is at `ms` of the wall clock, as progress through its keyframes. */
function progressAt(effect: KeyframeEffect, ms: number): number {
  const { duration, iterations, direction, easing } = effect.getComputedTiming()
  const length = Number(duration)
  if (!length) return 1
  const local = Math.min(ms, length * Number(iterations)) // WAAPI: 1.5 iterations end halfway through the second
  const last = Math.max(Math.ceil(Number(iterations)) - 1, 0)
  const iteration = Math.min(Math.floor(local / length), last)
  const within = Math.min(local - iteration * length, length) / length
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
function samplesOf(effect: KeyframeEffect, backdrop: Backdrop): ColorSample[] {
  const frames = effect.getKeyframes()
  const colors = frames.map((frame) => colorOf(frame, backdrop))
  return Array.from({ length: SAMPLES_PER_SECOND * SECONDS }, (_, i) => {
    const t = (i * 1000) / SAMPLES_PER_SECOND
    return { t, ...colorAt(frames, colors, progressAt(effect, t)) }
  })
}

/** An animated element's verdict; null when it animates nothing inside `root`. */
function predict(
  animation: Animation,
  root: ParentNode,
  reader: ColorReader,
  page: RGB,
): PredictedFlash | null {
  const effect = animation.effect
  if (!(effect instanceof KeyframeEffect)) return null
  const element = effect.target
  if (!element || !root.contains(element)) return null
  const backdrop = new Backdrop(reader, getComputedStyle(element), page)
  const counted = countFlashes(samplesOf(effect, backdrop))
  const area = shareOf(element)
  const fails = counted.perSecond > FLASH_LIMIT && area > SAFE_AREA_SHARE
  return { element, ...counted, area, fails }
}

/** The element's share of the viewport. */
function shareOf(element: Element): number {
  const box = element.getBoundingClientRect()
  return (box.width * box.height) / (innerWidth * innerHeight)
}

/**
 * The predicted source of the flash checker: from the keyframes of
 * the animations running in `root` — their background or text colour and
 * opacity, their timing and easing — the flashes each would make, counted
 * by WCAG 2.3.1's rule. Cheap enough for development; it can't see
 * images, video or canvas (the measured source can).
 *
 *   predictFlashes().filter((f) => f.fails)
 */
export function predictFlashes(root: ParentNode = document): PredictedFlash[] {
  const reader = new ColorReader()
  const page = Backdrop.pageOf(reader)
  const found = document
    .getAnimations()
    .map((a) => predict(a, root, reader, page))
  return found.filter((f): f is PredictedFlash => f !== null)
}
