import { COMPONENT_STYLE, PAGE_SHEET } from '../../shared/markup/vocabulary'
import {
  pageCss,
  samePageSheet,
  type ComponentStyles,
  type PageSheet,
} from '../../shared/omino/styles'

/**
 * A component's CSS in the browser: once per document, as the
 * server writes it (`<style data-scope-for>` in `<head>`); a page the
 * server already styled is left as it is.
 */
export function ensureSheet(styles: ComponentStyles): void {
  const selector = `style[${COMPONENT_STYLE}="${CSS.escape(styles.name)}"]`
  const css = pageCss(styles)
  const existing = document.head.querySelector(selector)
  if (existing) return sameOrThrow(styles.name, existing.textContent ?? '', css)
  const style = document.createElement('style')
  style.setAttribute(COMPONENT_STYLE, styles.name)
  style.textContent = css
  document.head.append(style)
}

/** A page-wide sheet (glyph's), once per document by name, as the server writes it. */
export function ensurePageSheet(sheet: PageSheet): void {
  const selector = `style[${PAGE_SHEET}="${CSS.escape(sheet.name)}"]`
  const existing = document.head.querySelector(selector)
  if (existing) {
    if ((existing.textContent ?? '').trim() === sheet.css.trim()) return
    throw samePageSheet(sheet.name)
  }
  const style = document.createElement('style')
  style.setAttribute(PAGE_SHEET, sheet.name)
  style.textContent = sheet.css
  document.head.append(style)
}

const shared = new Map<string, { sheet: CSSStyleSheet; css: string }>()

/** `shadow`: one constructed sheet per component, adopted by every instance. */
export function shadowSheet(styles: ComponentStyles): CSSStyleSheet {
  const known = shared.get(styles.name)
  if (known)
    return (sameOrThrow(styles.name, known.css, styles.css), known.sheet)
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(styles.css)
  shared.set(styles.name, { sheet, css: styles.css })
  return sheet
}

/** Two components with one name and different styles would share a sheet: an error here as on the server. */
function sameOrThrow(name: string, known: string, css: string): void {
  if (known.trim() === css.trim()) return
  throw new Error(
    `omino: two components named "${name}" have different styles; the scope is the class name, so give one another name`,
  )
}
