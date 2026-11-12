/** glyph's font pieces on a test page, built by Bun as a classic script. */
import { loadFont } from './load-font'
import { measureFont } from './measure-font'

;(window as any).glyph = { loadFont, measureFont }
