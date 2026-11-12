/** bridge's options on a test page, built by Bun as a classic script: what a script and the markup say. */
import { optionsFrom, optionsOf } from './options'

;(window as any).optionsTest = () => {
  const from = document.querySelector('#inside')!
  const pick = ({ history, fail, busy }: ReturnType<typeof optionsOf>) => ({
    history,
    fail,
    busy,
  })
  return {
    leftOut: pick(optionsFrom({ target: '_top' }, from)),
    none: pick(
      optionsFrom(
        { target: '_top', history: null, fail: null, busy: null },
        from,
      ),
    ),
    markupNone: pick(optionsOf(document.querySelector('#quiet')!)),
  }
}
