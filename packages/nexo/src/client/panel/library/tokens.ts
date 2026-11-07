import { panel } from '../panel'
import { json } from '../params'

/**
 * Tokens (Archive's paint/tokens): CSS custom properties set on an element
 * from its params, removed when it disconnects.
 *
 *   <div data-panel="tokens" data-tokens-values='{"accent":"#e3b341","gap":"1rem"}'>
 *   → style="--accent: #e3b341; --gap: 1rem"
 */
export const tokens = panel({
  params: { values: json<Record<string, string | number>>({}) },
  connect(el, { values }, { signal }) {
    const style = (el as HTMLElement).style
    const names = Object.keys(values).map((key) => `--${key}`)
    names.forEach((name, i) =>
      style.setProperty(name, String(Object.values(values)[i])),
    )
    signal.addEventListener(
      'abort',
      () => names.forEach((n) => style.removeProperty(n)),
      { once: true },
    )
  },
})
