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
 * own source text, so it may use nothing outside itself. It wraps what the
 * page uses to pause, resume and seek an animation, to tell the page's
 * intent from its own steps: what the page paused stays paused, what it
 * seeked or finished stays where it put it, and everything else moves on,
 * held paused in between so only `advance` moves it.
 */
class PageClock {
  /** What the page last asked of an animation, when it paused or played it itself. */
  private readonly intents = new WeakMap<Animation, 'paused' | 'playing'>()
  private readonly times = new WeakMap<Animation, number>()
  private readonly pause = Animation.prototype.pause
  private readonly finish = Animation.prototype.finish
  /** The platform's own `currentTime`, before the page's seeks are wrapped. */
  private readonly currentTime = Object.getOwnPropertyDescriptor(
    Animation.prototype,
    'currentTime',
  )!

  /** Wraps the page's ways to pause, resume, finish and seek (sent in by `INSTALL`). */
  watch(): void {
    this.watchPause()
    this.watchPlay()
    this.watchReverse()
    this.watchFinish()
    this.watchSeeks()
  }

  private watchPause(): void {
    const clock = this
    Animation.prototype.pause = function (this: Animation) {
      clock.intents.set(this, 'paused')
      clock.pause.call(this)
    }
  }

  /** `play` resumes on the document's real timeline: held at once, or the real time until the next advance would count. */
  private watchPlay(): void {
    const clock = this
    const { play } = Animation.prototype
    Animation.prototype.play = function (this: Animation) {
      clock.intents.set(this, 'playing')
      play.call(this)
      clock.hold(this)
    }
  }

  /**
   * `reverse` resumes a paused animation too. WAAPI applies its new rate
   * on the next frame; under this clock time moves in steps, so the rate
   * is set at once (setting `playbackRate` keeps the current time).
   */
  private watchReverse(): void {
    const clock = this
    const { reverse } = Animation.prototype
    Animation.prototype.reverse = function (this: Animation) {
      const rate = -this.playbackRate
      clock.intents.set(this, 'playing')
      reverse.call(this)
      this.playbackRate = rate
      clock.hold(this)
    }
  }

  /**
   * A page's `finish`, and its seeks below, are where the clock goes on
   * from — held there, like `play`, as the real timeline would carry them
   * on.
   */
  private watchFinish(): void {
    const clock = this
    Animation.prototype.finish = function (this: Animation) {
      clock.finish.call(this)
      clock.hold(this)
    }
  }

  private watchSeeks(): void {
    const clock = this
    Object.defineProperty(Animation.prototype, 'currentTime', {
      ...this.currentTime,
      set(this: Animation, time: CSSNumberish | null) {
        clock.seekTo(this, time)
        clock.hold(this)
      },
    })
  }

  private seekTo(animation: Animation, time: CSSNumberish | null): void {
    this.currentTime.set!.call(animation, time)
  }

  /** Paused by the clock where it is now, and remembered there. */
  private hold(animation: Animation): void {
    this.pause.call(animation)
    this.times.set(animation, Number(animation.currentTime ?? 0))
  }

  /** Every element animation (WAAPI and CSS) `ms` on. */
  seek(ms: number): void {
    for (const animation of document.getAnimations()) this.step(animation, ms)
  }

  /**
   * One animation `ms` on — unless the page paused it, or it stands still
   * (rate 0: nothing to move, and `finish` would throw). An animation CSS
   * pauses is held where CSS stopped it, until CSS lets it go.
   */
  private step(animation: Animation, ms: number): void {
    const intent = this.intents.get(animation)
    if (intent === 'paused' || animation.playbackRate === 0) return
    if (intent !== 'playing' && this.pausedByCss(animation))
      this.hold(animation)
    else this.move(animation, ms)
  }

  /**
   * `animation-play-state: paused`, read from CSS every time: the clock's
   * own `pause` detaches a CSS animation from that property, so its
   * playState no longer says. A page's `play` overrides CSS, as WAAPI's.
   */
  private pausedByCss(animation: Animation): boolean {
    const target = (animation.effect as KeyframeEffect | null)?.target
    if (!(animation instanceof CSSAnimation) || !target) return false
    const pseudo = (animation.effect as KeyframeEffect).pseudoElement
    const style = getComputedStyle(target, pseudo)
    const at = style.animationName.split(', ').indexOf(animation.animationName)
    const states = style.animationPlayState.split(', ')
    return states[at % states.length] === 'paused'
  }

  /**
   * Paused at its new time — forward or backward, as its playback rate
   * says; at its end (or its start, in reverse) it finishes, so
   * `finished` resolves.
   */
  private move(animation: Animation, ms: number): void {
    const rate = animation.playbackRate
    const end = Number(animation.effect?.getComputedTiming().endTime ?? 0)
    const now = this.timeOf(animation) + ms * rate
    this.pause.call(animation)
    this.times.set(animation, now)
    if (rate > 0 ? now >= end : now <= 0) this.finish.call(animation)
    else this.seekTo(animation, now)
  }

  /**
   * Where the clock (or the page's seek) last put it. The first time it
   * is seen it starts at 0 (it began at the last moment the clock stood
   * at), so the real time it ran before is not counted; if something else
   * moved it since (its start time, its timing), that.
   */
  private timeOf(animation: Animation): number {
    const current = Number(animation.currentTime ?? 0)
    const set = this.times.get(animation)
    if (set === undefined) return animation.playbackRate < 0 ? current : 0
    return Math.abs(current - set) > 0.5 ? current : set
  }
}

/** The script that puts a PageClock in the page before its own scripts. */
const INSTALL = `window.theaterClock = new (${PageClock})(); window.theaterClock.watch()`

/** Runs in the page: resolves once a real frame was presented. */
function paintedOnce(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

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
   * `setContent` rewrites that one without navigating. The page paints
   * one real frame first: Chrome can't capture a screenshot of a page
   * that never presented one, and once the clock holds
   * `requestAnimationFrame` nothing asks for it.
   */
  static async on(page: ClockPage): Promise<TestClock> {
    await page.evaluate(paintedOnce, undefined)
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
