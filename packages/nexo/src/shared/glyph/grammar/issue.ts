import { closest } from '../closest'
import { referenceName } from '../reference'
import type { TokenSet } from '../token-set'
import type { TokenType } from '../typed'

/**
 * Why a value a person typed can't be read: not of its type, a reference
 * to a token that isn't there, or to one of another type.
 */
export type Issue =
  | { readonly kind: 'wrong' }
  | {
      readonly kind: 'missing'
      readonly name: string
      readonly suggestion?: string
    }
  | {
      readonly kind: 'mistyped'
      readonly name: string
      readonly type: TokenType
    }

export const WRONG: Issue = { kind: 'wrong' }

/** The tokens a value may point into: the theme's own and its palettes'. */
export class References {
  constructor(private readonly set: TokenSet) {}

  /** Whether `text` is a reference at all. */
  is(text: string): boolean {
    return referenceName(text) !== undefined
  }

  /** The type of the token `text` points to, or why it points nowhere. */
  typeOf(text: string): TokenType | Issue {
    const name = referenceName(text)
    if (name === undefined) return WRONG
    const found = this.set.find(name)
    if (found) return found.type
    const suggestion = closest(name, this.set.knownProperties())
    return { kind: 'missing', name, suggestion }
  }

  /** Nothing when `text` points to a token of `type`, else why not. */
  check(text: string, type: TokenType): Issue | undefined {
    const found = this.typeOf(text)
    if (typeof found !== 'string') return found
    if (found === type) return undefined
    return { kind: 'mistyped', name: referenceName(text)!, type: found }
  }
}
