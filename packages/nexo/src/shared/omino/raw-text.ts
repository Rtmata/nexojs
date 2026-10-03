import { rawOf, textOf } from './leaf'
import { isSlot, type Placed, type SlotResolver } from './slots'

/**
 * The content of <script> and <style>: raw text, not HTML. Browsers never
 * decode entities there, so escaping would corrupt inline JS, CSS or
 * JSON-LD. Only text, `raw()` and slots that resolve to text are accepted;
 * each kind of element then writes that text its own way.
 *
 *   rawText.render('style', {}, items)   // 'a::after { content: "<\/style" }'
 */
export class RawText {
  constructor(private readonly slots: SlotResolver) {}

  render(
    tag: 'script' | 'style',
    props: Record<string, unknown>,
    items: readonly Placed[],
  ): string {
    return KINDS[tag](props).write(this.join(tag, items))
  }

  private join(tag: string, items: readonly Placed[]): string {
    return items.map((item) => this.plainText(tag, item)).join('')
  }

  private plainText(tag: string, { child, scope }: Placed): string {
    const text = textOf(child) ?? rawOf(child)
    if (text !== undefined) return text
    if (isSlot(child))
      return this.join(tag, this.slots.content(child.props, scope))
    throw new Error(
      `omino: <${tag}> only accepts text. Put markup and components outside it, or pass them as raw() text`,
    )
  }
}

/** One way of writing raw text safely (pattern: strategy). */
interface RawTextKind {
  write(text: string): string
}

/** Which kind writes an element's text: a <script>'s depends on its type. */
const KINDS: Record<
  'script' | 'style',
  (props: Record<string, unknown>) => RawTextKind
> = {
  style: () => STYLE,
  script: (props) => (isScriptCode(props.type) ? SCRIPT_CODE : VERBATIM),
}

/** CSS: `</style` becomes `<\/style`, still valid in CSS strings. */
const STYLE: RawTextKind = {
  write: (text) => text.replace(/<\/style/gi, (m) => `<\\/${m.slice(2)}`),
}

/**
 * JavaScript and JSON: `</script` becomes `<\/script`, and `<script` (which
 * after a `<!--` starts the "double escaped" state, where the real closing
 * tag no longer counts) is written `<script`. Both read back as the
 * same text in JS strings, regexes, identifiers and JSON.
 */
const SCRIPT_CODE: RawTextKind = {
  write: (text) =>
    text
      .replace(/<\/script/gi, (m) => `<\\/${m.slice(2)}`)
      .replace(
        /<script/gi,
        (m) => `<\\u00${m.charCodeAt(1).toString(16)}${m.slice(2)}`,
      ),
}

/**
 * Any other script (a template, a shader…): written as is, since rewriting
 * would change it. Text that would end the element early can't be written
 * at all, so it fails clearly.
 */
const VERBATIM: RawTextKind = {
  write(text) {
    if (!/<\/script|<!--/i.test(text)) return text
    throw new Error(
      'omino: this <script> can\'t hold "</script" or "<!--": the browser would end it early. Keep such markup in a <template> element instead',
    )
  },
}

/**
 * Types whose content runs as JavaScript or is JSON: the browser's own list
 * (WHATWG "JavaScript MIME type essence") plus modules, JSON and maps.
 */
const CODE_TYPES = new Set([
  '',
  'module',
  'importmap',
  'speculationrules',
  'application/json',
  'application/ld+json',
  'text/javascript',
  'application/javascript',
  'application/ecmascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
])

/** A type left out (`undefined`, `null`, `false`) or bare (`true`) is JavaScript too. */
function isScriptCode(type: unknown): boolean {
  if (type == null || typeof type === 'boolean') return true
  return CODE_TYPES.has(String(type).trim().toLowerCase())
}
