import type { Sheet } from '../../shared/glyph/sheet'

/**
 * Puts a theme on the page while `signal` lives (C.4): its CSS in a
 * constructed stylesheet added to `document.adoptedStyleSheets`, taken
 * away on abort. For themes made at runtime (`themeFrom`, a person's own);
 * once adopted it works as any theme, by `data-theme`, nested or not.
 * `signal` is required: nothing else would ever take the sheet away.
 *
 *   const result = themeFrom(tokens, json)
 *   if (result.ok) adoptTheme(result.theme, { signal: controller.signal })
 *   document.documentElement.dataset.theme = 'mine'
 */
export function adoptTheme(
  theme: Sheet,
  { signal }: { readonly signal: AbortSignal },
): void {
  if (signal.aborted) return
  const adopted = new CSSStyleSheet()
  adopted.replaceSync(theme.css)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, adopted]
  signal.addEventListener('abort', () => remove(adopted), { once: true })
}

/** Only this sheet: others may have been adopted since, by glyph or not. */
function remove(adopted: CSSStyleSheet): void {
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
    (sheet) => sheet !== adopted,
  )
}
