import { reducedMotion } from '../../theater/reduce'
import { speedOf } from '../../theater/speed'
import { panel } from '../panel'
import { number, string } from '../params'
import { emit } from './hold'
import { graphemes, speakingText } from './motion'

/**
 * Decode (Archive): the text starts scrambled and settles left to right
 * over `duration` ms, scrambling with `charset`; spaces stay spaces. The
 * whole content stays readable by assistive technology; with reduced
 * motion it's shown at once. `decode:done` at the end.
 */
export const decode = panel({
  params: {
    duration: number(800),
    charset: string('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*'),
  },
  connect(el, params, { signal }) {
    if (reducedMotion()) return emit(el, 'decode:done')
    const duration = params.duration / speedOf(el) // the page speed, as every animation below it
    new Decode(el as HTMLElement, { ...params, duration }, signal)
  },
})

class Decode {
  private readonly units: string[]
  private readonly shown: HTMLElement
  private readonly restore: () => void
  private readonly started = performance.now()
  private frame = 0

  constructor(
    private readonly el: HTMLElement,
    private readonly params: { duration: number; charset: string },
    signal: AbortSignal,
  ) {
    const { text, shown, restore } = speakingText(el)
    this.units = graphemes(text)
    this.shown = shown
    this.restore = restore
    this.frame = requestAnimationFrame((now) => this.draw(now))
    signal.addEventListener('abort', () => this.stop(), { once: true })
  }

  private draw(now: number): void {
    const { duration, charset } = this.params
    const progress = Math.min(1, (now - this.started) / duration)
    this.shown.textContent = scrambled(this.units, progress, charset)
    if (progress < 1) this.frame = requestAnimationFrame((t) => this.draw(t))
    else this.finish()
  }

  private finish(): void {
    this.stop()
    emit(this.el, 'decode:done')
  }

  private stop(): void {
    cancelAnimationFrame(this.frame)
    this.restore()
  }
}

/** The first `progress` of the characters settled, the rest random from `charset`. */
export function scrambled(
  units: string[],
  progress: number,
  charset: string,
): string {
  const settled = Math.floor(units.length * progress)
  const random = () => charset[Math.floor(Math.random() * charset.length)]
  return units.map((c, i) => (i < settled || c === ' ' ? c : random())).join('')
}
