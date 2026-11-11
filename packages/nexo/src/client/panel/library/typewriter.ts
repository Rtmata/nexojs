import { reducedMotion } from '../../theater/reduce'
import { speedOf } from '../../theater/speed'
import { panel } from '../panel'
import { number } from '../params'
import { emit } from './hold'
import { graphemes, speakingText } from './motion'

/**
 * Typewriter (Archive): the element's text appears a character at a time
 * (whole graphemes: an emoji never shows half), one every `interval` ms
 * divided by the page's speed (`--theater-speed`, C.1b); the
 * whole content stays readable by assistive technology meanwhile, and
 * shows at once with reduced motion. `typewriter:done` at the end.
 */
export const typewriter = panel({
  params: { interval: number(30) },
  connect(el, { interval }, { signal }) {
    if (reducedMotion()) return emit(el, 'typewriter:done')
    new Typewriter(el as HTMLElement, interval / speedOf(el), signal)
  },
})

class Typewriter {
  private readonly units: string[]
  private readonly shown: HTMLElement
  private readonly restore: () => void
  private readonly timer: ReturnType<typeof setInterval>
  private at = 0

  constructor(
    private readonly el: HTMLElement,
    interval: number,
    signal: AbortSignal,
  ) {
    const { text, shown, restore } = speakingText(el)
    this.units = graphemes(text)
    this.shown = shown
    this.restore = restore
    this.timer = setInterval(() => this.step(), interval)
    signal.addEventListener('abort', () => this.stop(), { once: true })
  }

  private step(): void {
    this.shown.textContent = this.units.slice(0, ++this.at).join('')
    if (this.at < this.units.length) return
    this.stop()
    emit(this.el, 'typewriter:done')
  }

  private stop(): void {
    clearInterval(this.timer)
    this.restore()
  }
}
