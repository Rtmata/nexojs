import { panel } from '../panel'
import { number, string } from '../params'
import { emit } from './hold'
import { reducedMotion, speakingText } from './motion'

/**
 * Decode (Archive): the text starts scrambled and settles left to right
 * over `duration` ms, scrambling with `charset`; spaces stay spaces. The
 * whole text stays readable by assistive technology; with reduced motion
 * it's shown at once. `decode:done` at the end.
 */
export const decode = panel({
  params: {
    duration: number(800),
    charset: string('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*'),
  },
  connect(el, params, { signal }) {
    if (reducedMotion()) return emit(el, 'decode:done')
    new Decode(el as HTMLElement, params, signal)
  },
})

class Decode {
  private readonly text: string
  private readonly shown: HTMLElement
  private readonly restore: () => void
  private readonly started = performance.now()
  private frame = 0

  constructor(
    private readonly el: HTMLElement,
    private readonly params: { duration: number; charset: string },
    signal: AbortSignal,
  ) {
    this.text = el.textContent ?? ''
    ;({ shown: this.shown, restore: this.restore } = speakingText(
      el,
      this.text,
    ))
    this.frame = requestAnimationFrame((now) => this.draw(now))
    signal.addEventListener('abort', () => this.stop(), { once: true })
  }

  private draw(now: number): void {
    const { duration, charset } = this.params
    const progress = Math.min(1, (now - this.started) / duration)
    this.shown.textContent = scrambled(this.text, progress, charset)
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

/** The first `progress` of the text settled, the rest random from `charset`. */
export function scrambled(
  text: string,
  progress: number,
  charset: string,
): string {
  const settled = Math.floor(text.length * progress)
  const random = () => charset[Math.floor(Math.random() * charset.length)]
  return [...text]
    .map((c, i) => (i < settled || c === ' ' ? c : random()))
    .join('')
}
