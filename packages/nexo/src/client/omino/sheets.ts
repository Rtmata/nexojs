import {
  pageCss,
  STYLE_MARKER,
  type ComponentStyles,
} from '../../shared/omino/styles'

/**
 * A component's CSS in the browser (C.20a): once per document, as the
 * server writes it (`<style data-scope-for>` in `<head>`); a page the
 * server already styled is left as it is.
 */
export function ensureSheet(styles: ComponentStyles): void {
  const selector = `style[${STYLE_MARKER}="${CSS.escape(styles.name)}"]`
  if (document.head.querySelector(selector)) return
  const style = document.createElement('style')
  style.setAttribute(STYLE_MARKER, styles.name)
  style.textContent = pageCss(styles)
  document.head.append(style)
}

const shared = new Map<string, CSSStyleSheet>()

/** `shadow` (item 36): one constructed sheet per component, adopted by every instance. */
export function shadowSheet(styles: ComponentStyles): CSSStyleSheet {
  let sheet = shared.get(styles.name)
  if (sheet) return sheet
  sheet = new CSSStyleSheet()
  sheet.replaceSync(styles.css)
  shared.set(styles.name, sheet)
  return sheet
}
