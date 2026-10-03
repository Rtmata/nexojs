import type { Context, Link } from '../../shared/http/types'
import type { KeepRouter } from './keep'

/**
 * Builds the context each request starts with: the request, its URL, its
 * language (from the router's `langOf`) and `ctx.link`.
 */
export class Contexts {
  constructor(private readonly router: KeepRouter) {}

  forRequest(request: Request): Context {
    const lang = this.languageOf(request)
    return {
      request,
      url: new URL(request.url),
      params: {},
      lang,
      link: this.link(lang),
    }
  }

  /**
   * `ctx.link` in a language, as the router builds it (boat: the same rule
   * its routes use). Called as a method, so a router class keeps its `this`.
   */
  link(lang: string | undefined): Link {
    return this.router.linkFor ? this.router.linkFor(lang) : noLinks
  }

  /** A broken rule (or header) must not take the request down. */
  private languageOf(request: Request): string | undefined {
    try {
      return this.router.langOf?.(request)
    } catch (error) {
      console.error('keep: could not read the request language\n', error)
      return undefined
    }
  }
}

const noLinks = (() => {
  throw new Error(
    'keep: ctx.link needs a router that can build links, like boat()',
  )
}) as Link
