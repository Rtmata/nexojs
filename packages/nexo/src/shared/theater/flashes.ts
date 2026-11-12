import { countFlashes, FLASH_LIMIT, type ColorSample } from './flash-counter'
import type { TestClock } from './test-clock'

/** What the measured source needs from a Playwright page. */
export interface FlashPage {
  screenshot(): Promise<Uint8Array>
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>
}

/** One region of the screen and what the counter found there. */
export interface MeasuredFlash {
  column: number
  row: number
  perSecond: number
  red: boolean
  /** More than three a second: a region is a ninth of the screen, the safe area (WCAG Note 1). */
  fails: boolean
}

export interface FlashReport {
  regions: MeasuredFlash[]
  failures: MeasuredFlash[]
}

/** 3 × 3: each region is a ninth of the screen, exactly WCAG's 341 × 256 at 1024 × 768. */
const GRID = 3
const FRAME_MS = 16

/**
 * The page's half: decodes a screenshot with the browser itself and
 * averages each region's colour. Sent to the page as its own source, so
 * it may use nothing outside itself.
 */
class PageTiles {
  /** Each sRGB channel value in linear light, the way the eye adds light. */
  private readonly linear = Array.from({ length: 256 }, (_, v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })

  async read(
    png: string,
    grid: number,
  ): Promise<{ r: number; g: number; b: number }[]> {
    const blob = await (await fetch(`data:image/png;base64,${png}`)).blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const { data, width, height } = context.getImageData(
      0,
      0,
      bitmap.width,
      bitmap.height,
    )
    return Array.from({ length: grid * grid }, (_, i) =>
      this.average(data, width, height, grid, i),
    )
  }

  /**
   * The average colour of region `i`, every other pixel each way. Averaged
   * in linear light, then encoded back: half black, half white is the grey
   * of luminance 0.5 the eye sees, not sRGB 127 (luminance 0.21).
   */
  private average(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    grid: number,
    i: number,
  ) {
    const box = this.box(width, height, grid, i)
    const sum = { r: 0, g: 0, b: 0, n: 0 }
    for (let y = box.y0; y < box.y1; y += 2) {
      for (let x = box.x0; x < box.x1; x += 2)
        this.add(sum, data, (y * width + x) * 4)
    }
    const encoded = (total: number) => this.encoded(total / sum.n)
    return { r: encoded(sum.r), g: encoded(sum.g), b: encoded(sum.b) }
  }

  private add(
    sum: { r: number; g: number; b: number; n: number },
    data: Uint8ClampedArray,
    at: number,
  ): void {
    sum.r += this.linear[data[at]!]!
    sum.g += this.linear[data[at + 1]!]!
    sum.b += this.linear[data[at + 2]!]!
    sum.n++
  }

  /** Linear light back to an sRGB channel value (0–255), as the counter takes it. */
  private encoded(light: number): number {
    const c =
      light <= 0.0031308 ? light * 12.92 : 1.055 * light ** (1 / 2.4) - 0.055
    return c * 255
  }

  private box(width: number, height: number, grid: number, i: number) {
    const [column, row] = [i % grid, Math.floor(i / grid)]
    const x = (c: number) => Math.floor((c * width) / grid)
    const y = (r: number) => Math.floor((r * height) / grid)
    return { x0: x(column), x1: x(column + 1), y0: y(row), y1: y(row + 1) }
  }
}

const INSTALL = `window.theaterTiles = new (${PageTiles})()`

/** Bytes as base64, in chunks (a spread of a whole screenshot would overflow the stack). */
function base64Of(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}

/** One frame: the clock moves on, the screen is captured and read region by region. */
async function frame(
  page: FlashPage,
  clock: TestClock,
): Promise<Omit<ColorSample, 't'>[]> {
  await clock.advance(FRAME_MS)
  const png = base64Of(await page.screenshot())
  return page.evaluate(
    ([png, grid]) => (window as any).theaterTiles.read(png, grid),
    [png, GRID] as const,
  )
}

/**
 * The measured source of the flash checker: the page's real frames
 * — images, video and canvas included — captured on the test clock and
 * fed to WCAG 2.3.1's counter, region by region (a 3 × 3 grid, each a
 * ninth of the screen: the safe area). A flash smaller than a region is
 * averaged with what surrounds it, so the predicted source is the finer
 * check for small elements.
 *
 *   const report = await flashes(page, { seconds: 3, clock })
 *   expect(report.failures).toEqual([])
 */
export async function flashes(
  page: FlashPage,
  options: { seconds?: number; clock: TestClock },
): Promise<FlashReport> {
  await page.evaluate((code) => (0, eval)(code), INSTALL)
  const frames = Math.round(((options.seconds ?? 3) * 1000) / FRAME_MS)
  const series = await recorded(page, options.clock, frames)
  const regions = series.map((samples, tile) => verdict(samples, tile))
  return { regions, failures: regions.filter((region) => region.fails) }
}

/** Each region's colour, frame by frame. */
async function recorded(
  page: FlashPage,
  clock: TestClock,
  frames: number,
): Promise<ColorSample[][]> {
  const series: ColorSample[][] = Array.from({ length: GRID * GRID }, () => [])
  for (let i = 0; i < frames; i++) {
    const tiles = await frame(page, clock)
    tiles.forEach((color, tile) =>
      series[tile]!.push({ t: i * FRAME_MS, ...color }),
    )
  }
  return series
}

function verdict(samples: ColorSample[], tile: number): MeasuredFlash {
  const { perSecond, red } = countFlashes(samples)
  return {
    column: tile % GRID,
    row: Math.floor(tile / GRID),
    perSecond,
    red,
    fails: perSecond > FLASH_LIMIT,
  }
}
