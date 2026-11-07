import { panel } from '../panel'
import { string } from '../params'

/**
 * Replay (Archive, instead of re-creating the node): the element's
 * animations, and its subtree's, start over. Once on connect, and each
 * time the `on` event reaches it (`data-replay-on="click"`).
 */
export const replay = panel({
  params: { on: string('') },
  connect(el, { on }, { signal }) {
    if (on) el.addEventListener(on, () => replayAnimations(el), { signal })
  },
})

/** Every animation from the start: what `replay` does, callable on its own. */
export function replayAnimations(el: Element): void {
  for (const animation of el.getAnimations({ subtree: true })) {
    animation.cancel()
    animation.play()
  }
}
