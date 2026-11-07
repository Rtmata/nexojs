import type { Child } from './element'
import { Renderer } from './renderer'
import { SegmentPicker } from './segment'

/**
 * What a page may hand every component's `template(context)`.
 * Empty by default; describe yours once, with TypeScript's interface merging:
 *
 *   declare module '@nexoamigos/nexo/omino' {
 *     interface RenderContext { lang: 'en' | 'es'; link: Link<'en' | 'es'> }
 *   }
 *
 * Once it has fields, every `render()` must pass them (the compiler checks).
 */
export interface RenderContext {}

/** `render()` options: a normal `ResponseInit`, plus the optional `context` and `only`. */
export type RenderOptions = ResponseInit & {
  /**
   * Answer with these `<Segment>`s only, no doctype, in this order: what
   * bridge asks for with `?_segment=` (an empty list asks for the whole
   * page). The whole page is still rendered; a name the page lacks adds
   * nothing.
   */
  only?: readonly string[]
} & ({} extends RenderContext
    ? { context?: RenderContext }
    : { context: RenderContext })

/**
 * Render a page and answer with it: `<!doctype html>`, the HTML, and an
 * HTML content type (unless `options.headers` sets its own).
 *
 *   router.get('/', () => render(<HomePage />))
 *   router.notFound(() => render(<LostRoom />, { status: 404 }))
 *
 * Data reaches components through props. For data every component of the
 * page may need (the language, a link builder), `context` is an optional
 * shortcut: every component's `template(context)` receives it, without each
 * level passing it down. It comes only from this call, so it's traceable:
 *
 *   render(<LostRoom />, { status: 404, context: { lang, t } })
 *
 * Once an app declares required `RenderContext` fields, every `render()`
 * must pass them (the compiler checks), so apps usually wrap it once.
 * Every component gets this very object, as given (a class instance keeps
 * its methods): treat it as read-only, as its type says.
 */
export async function render(
  tree: Child,
  ...[options]: {} extends RenderContext
    ? [options?: RenderOptions]
    : [options: RenderOptions]
): Promise<Response> {
  const {
    context,
    only,
    ...init
  }: ResponseInit & { context?: RenderContext; only?: readonly string[] } =
    options ?? {}
  const html = await documentOrSegments(tree, context, only)
  return new Response(html, { ...init, headers: htmlHeaders(init.headers) })
}

/** The whole document with its doctype, or just the segments asked for. */
async function documentOrSegments(
  tree: Child,
  context: RenderContext | undefined,
  only: readonly string[] | undefined,
): Promise<string> {
  if (only?.length) return renderToString(tree, context, only)
  return '<!doctype html>' + (await renderToString(tree, context))
}

function htmlHeaders(given: HeadersInit | undefined): Headers {
  const headers = new Headers(given)
  if (!headers.has('content-type'))
    headers.set('content-type', 'text/html; charset=utf-8')
  return headers
}

/**
 * The context of `render()` called without one: empty, so optional fields
 * read as undefined. Only reachable while `RenderContext` has no required
 * fields (the compiler demands a context otherwise), hence the cast.
 */
const EMPTY_CONTEXT = Object.freeze({}) as RenderContext

/**
 * Turn a tree into HTML text; with `only`, just the segments named. Internal
 * for now; `render()` is the public API.
 */
export async function renderToString(
  tree: Child,
  context: RenderContext = EMPTY_CONTEXT,
  only?: readonly string[],
): Promise<string> {
  const picker = only ? new SegmentPicker(only) : undefined
  const renderer = new Renderer(context, undefined, false, picker)
  const html = await renderer.page(tree)
  return renderer.sheets.into(picker ? picker.html() : html)
}
