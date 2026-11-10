/**
 * What `testClock` needs from a Playwright page: its clock, init scripts
 * and `evaluate`. Written as a shape, so theater never imports Playwright.
 */
export interface ClockPage {
  clock: {
    install(): Promise<void>
    runFor(ms: number): Promise<void>
  }
  addInitScript(script: { content: string }): Promise<unknown>
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>
}

/** One 60 Hz frame: how finely `advance` steps. */
const FRAME_MS = 16

/**
 * The page's half of the clock. It runs in the page, sent there as its
 * own source text, so it may use nothing outside itself. It remembers the
 * animations the page pauses on purpose (those stay paused), and moves the
 * others on, holding them paused in between.
 */
class PageClock {
  private readonly ownPauses = new WeakSet<Animation>()
  private readonly pause = Animation.prototype.pause

  /** Wraps `pause` / `play` to tell the page's pauses from the clock's. */
  watchPauses(): void {
    const ownPauses = this.ownPauses
    const { pause, play } = Animation.prototype
    Animation.prototype.pause = function (this: Animation) {
      ownPauses.add(this)
      pause.call(this)
    }
    Animation.prototype.play = function (this: Animation) {
      ownPauses.delete(this)
      play.call(this)
    }
  }

  /** Every element animation (WAAPI and CSS) `ms` on, unless the page paused it. */
  seek(ms: number): void {
    for (const animation of document.getAnimations()) {
      if (!this.ownPauses.has(animation)) this.move(animation, ms)
    }
  }

  /** Paused at its new time; at its end it finishes, so `finished` resolves. */
  private move(animation: Animation, ms: number): void {
    const end = Number(animation.effect?.getComputedTiming().endTime ?? 0)
    const now = Number(animation.currentTime ?? 0) + ms
    this.pause.call(animation)
    if (now >= end) animation.finish()
    else animation.currentTime = now
  }
}

/** The script that puts a PageClock in the page before its own scripts. */
const INSTALL = `window.theaterClock = new (${PageClock})(); window.theaterClock.watchPauses()`

/** Runs in the page: one step of the element clock. */
function seekInPage(ms: number): void {
  const clock = (window as unknown as { theaterClock?: PageClock }).theaterClock
  if (!clock) {
    throw new Error(
      'theater: call testClock(page) before page.goto() or page.setContent()',
    )
  }
  clock.seek(ms)
}

/**
 * One clock for both of theater's engines in a browser test (G.1).
 * `advance(ms)` moves Playwright's clock — timers, `requestAnimationFrame`
 * and `performance`, so theater's frame loop — and every element
 * animation by the same amount, a frame at a time. Element animations stay
 * paused between advances. Scroll-linked ones follow the scroll, not
 * this clock.
 *
 *   const clock = await testClock(page) // before page.goto / setContent
 *   await page.click('#enter-room')
 *   await clock.advance(200)
 */
export class TestClock {
  private constructor(private readonly page: ClockPage) {}

  /**
   * Installs Playwright's clock and the page's half on `page`: for every
   * navigation (an init script), and in the document open now, since
   * `setContent` rewrites that one without navigating.
   */
  static async on(page: ClockPage): Promise<TestClock> {
    await page.clock.install()
    await page.addInitScript({ content: INSTALL })
    await page.evaluate((code) => (0, eval)(code), INSTALL)
    return new TestClock(page)
  }

  /** Moves both clocks `ms` on, a frame at a time. */
  async advance(ms: number): Promise<void> {
    for (let left = ms; left > 0; left -= FRAME_MS) {
      const step = Math.min(left, FRAME_MS)
      await this.page.clock.runFor(step)
      await this.page.evaluate(seekInPage, step)
    }
  }
}

/** `TestClock.on(page)`, under the name approved in G.3b. */
export function testClock(page: ClockPage): Promise<TestClock> {
  return TestClock.on(page)
}
