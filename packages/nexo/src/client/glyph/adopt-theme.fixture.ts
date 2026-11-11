/**
 * adoptTheme on a test page: built by Bun as a classic script, it leaves
 * `window.glyph` for the test to call with a theme's CSS.
 */
import { adoptTheme } from './adopt-theme'

const controller = new AbortController()

;(window as any).glyph = {
  adopt: (css: string) =>
    adoptTheme({ name: 'test', css }, { signal: controller.signal }),
  stop: () => controller.abort(),
  adopted: () => document.adoptedStyleSheets.length,
}
