import { panel } from '../panel'
import { Marks } from './marks'

/**
 * Switch (WAI-ARIA APG Switch) on `<input type="checkbox" switch>`, the
 * platform's own (Safari 17.4; R.33).
 *
 *   <label><input type="checkbox" switch data-panel="switch"> Subtitles</label>
 *
 * GAP BRIDGE: Chrome and Firefox don't have `switch` (2026-11), so there the
 * control stays a checkbox for assistive technology. Where
 * `'switch' in HTMLInputElement.prototype` is false, the panel gives it
 * `role="switch"` (ARIA in HTML allows it on a checkbox); the rest —
 * Space toggles, `checked` is the state, forms send it — is the
 * checkbox's. The look is CSS. Remove when every engine ships `switch`.
 */
export const switchControl = panel({
  connect(el, _params, { signal }) {
    if (!(el instanceof HTMLInputElement) || el.type !== 'checkbox')
      throw new Error(
        `switch: data-panel="switch" goes on <input type="checkbox" switch>, not <${el.localName}>`,
      )
    if (hasSwitch() || el.hasAttribute('role')) return
    const marks = new Marks()
    marks.set(el, 'role', 'switch')
    signal.addEventListener('abort', () => marks.restore(), { once: true })
  },
})

export function hasSwitch(): boolean {
  return 'switch' in HTMLInputElement.prototype
}
