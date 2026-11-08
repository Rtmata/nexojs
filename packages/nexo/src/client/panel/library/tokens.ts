import { panel } from '../panel'
import { json } from '../params'
import { Marks } from './marks'

/**
 * Tokens (Archive's paint/tokens): CSS custom properties set on an element
 * from its params, back to what the server sent when it disconnects.
 *
 *   <div data-panel="tokens" data-tokens-values='{"accent":"#e3b341","gap":"1rem"}'>
 *   → style="--accent: #e3b341; --gap: 1rem"
 */
export const tokens = panel({
  params: { values: json<Record<string, string | number>>({}) },
  connect(el, { values }, { signal }) {
    const marks = new Marks()
    for (const [key, value] of Object.entries(values))
      marks.style(el as HTMLElement, `--${key}`, String(value))
    signal.addEventListener('abort', () => marks.restore(), { once: true })
  },
})
