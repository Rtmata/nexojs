import { panel } from '../panel'
import { number } from '../params'
import { emit } from './hold'
import { reducedMotion, speakingText } from './motion'

/**
 * Typewriter (Archive): the element's text appears a character at a time,
 * every `speed` ms; the whole text stays readable by assistive technology
 * meanwhile, and shows at once with reduced motion. `typewriter:done` at
 * the end.
 */
export const typewriter = panel({
  params: { speed: number(30) },
  connect(el, { speed }, { signal }) {
    if (reducedMotion()) return emit(el, 'typewriter:done')
    new Typewriter(el as HTMLElement, speed, signal)
  },
})

class Typewriter {
  private readonly text: string
  private readonly shown: HTMLElement
  private readonly restore: () => void
  private readonly timer: ReturnType<typeof setInterval>
  private at = 0

  constructor(
    private readonly el: HTMLElement,
    speed: number,
    signal: AbortSignal,
  ) {
    this.text = el.textContent ?? ''
    ;({ shown: this.shown, restore: this.restore } = speakingText(
      el,
      this.text,
    ))
    this.timer = setInterval(() => this.step(), speed)
    signal.addEventListener('abort', () => this.stop(), { once: true })
  }

  private step(): void {
    this.shown.textContent = this.text.slice(0, ++this.at)
    if (this.at < this.text.length) return
    this.stop()
    emit(this.el, 'typewriter:done')
  }

  private stop(): void {
    clearInterval(this.timer)
    this.restore()
  }
}
