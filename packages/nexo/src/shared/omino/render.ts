import type { Child } from './element'
import { Renderer } from './renderer'

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

/** `render()` options: a normal `ResponseInit`, plus the optional `context`. */
export type RenderOptions = ResponseInit &
  ({} extends RenderContext
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
  const { context, ...init }: ResponseInit & { context?: RenderContext } =
    options ?? {}
  const html = '<!doctype html>' + (await renderToString(tree, context))
  const headers = new Headers(init.headers)
  if (!headers.has('content-type'))
    headers.set('content-type', 'text/html; charset=utf-8')
  return new Response(html, { ...init, headers })
}

/**
 * The context of `render()` called without one: empty, so optional fields
 * read as undefined. Only reachable while `RenderContext` has no required
 * fields (the compiler demands a context otherwise), hence the cast.
 */
const EMPTY_CONTEXT = Object.freeze({}) as RenderContext

/** Turn a tree into HTML text. Internal for now; `render()` is the public API. */
export function renderToString(
  tree: Child,
  context: RenderContext = EMPTY_CONTEXT,
): Promise<string> {
  return new Renderer(context).page(tree)
}
