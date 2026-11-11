import { onNeededSheet } from '../../shared/glyph/recipe-calls'
import { PAGE_SHEET } from '../../shared/markup/vocabulary'

/**
 * Development only: add it from your dev entry, never from the production
 * one (the CSS may live in a built `.css` file there, with no sheet on the
 * page to find). From now on, a recipe called whose sheet never reaches
 * the page — listed in no `styles` list (A.2) — warns once, naming it.
 * It looks one microtask after the call: omino adds a component's sheets
 * right after its template runs.
 *
 *   checkRecipes({ signal })
 */
export function checkRecipes({
  signal,
}: {
  readonly signal: AbortSignal
}): void {
  const warned = new Set<string>()
  const check = (sheet: string) => {
    if (signal.aborted || warned.has(sheet) || onPage(sheet)) return
    warned.add(sheet)
    console.warn(unlisted(sheet))
  }
  onNeededSheet((sheet) => queueMicrotask(() => check(sheet)), signal)
}

function onPage(sheet: string): boolean {
  return (
    document.querySelector(`style[${PAGE_SHEET}="${CSS.escape(sheet)}"]`) !==
    null
  )
}

/** `glyph.recipes(button)` → the message about `button`. */
function unlisted(sheet: string): string {
  const name = sheet.slice('glyph.recipes('.length, -1)
  return `glyph: ${name}() is used, but its sheet isn't on the page; list ${name} in the static styles of the component that renders it`
}
