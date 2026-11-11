/**
 * checkRecipes on a test page: built by Bun as a classic script. Two
 * recipes are called; only one has its sheet on the page, as omino would
 * put it. The warnings are kept for the test to read.
 */
import { PAGE_SHEET } from '../../shared/markup/vocabulary'
import { recipe } from '../../shared/glyph/recipe'
import { checkRecipes } from './check-recipes'

const warnings: string[] = []
console.warn = (message: string) => warnings.push(message)

const listed = recipe('listed', {
  vars: {},
  base: () => ({ display: 'block' }),
})
const forgotten = recipe('forgotten', {
  vars: {},
  base: () => ({ display: 'block' }),
})

;(window as any).glyph = {
  run: async () => {
    const controller = new AbortController()
    checkRecipes({ signal: controller.signal })
    listed()
    forgotten()
    forgotten() // once per recipe
    const style = document.createElement('style') // omino, right after the template
    style.setAttribute(PAGE_SHEET, listed.name)
    style.textContent = listed.css
    document.head.append(style)
    await Promise.resolve()
    controller.abort()
    recipe('after', { vars: {}, base: () => ({}) })() // stopped: no warning
    await Promise.resolve()
    return warnings
  },
}
