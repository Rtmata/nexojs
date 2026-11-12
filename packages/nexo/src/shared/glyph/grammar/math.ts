import { REFERENCE_SOURCE } from '../reference'
import { dimensionOf, isLength } from './numbers'
import { WRONG, type Issue, type References } from './issue'

/** What a math expression is: a length (or percentage), or a plain number. */
type Kind = 'length' | 'number'

/** `calc(`, `min(`, `max(` or `clamp(` at the start: a math expression. */
export const MATH = /^(calc|min|max|clamp)\(/i

/** A number with its unit, `var(--x)`, a function's name with its `(`, or one sign. */
const TOKEN = new RegExp(
  String.raw`\s+|${REFERENCE_SOURCE}|(?:calc|min|max|clamp)\(|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:%|[A-Za-z]+)?|[()*/,+-]`,
  'giy',
)

/**
 * The kind of a math expression (CSS Values 4 §10): `calc()`, `min()`,
 * `max()`, `clamp()`, nested, with `+ - * /` and references to length or
 * number tokens. Types are checked as CSS does: `+` and `-` join the same
 * kind and need spaces around them, `*` needs a number on one side, `/` a
 * number on the right.
 */
export function mathKind(text: string, references: References): Kind | Issue {
  const tokens = tokensOf(text)
  if (!tokens) return WRONG
  return new MathReader(tokens, references).whole()
}

/** The tokens, with spaces kept as `' '` (they tell a sign from an operator). */
function tokensOf(text: string): string[] | undefined {
  const tokens: string[] = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < text.length) {
    const match = TOKEN.exec(text)
    if (!match) return undefined
    tokens.push(normalized(match[0]))
  }
  return tokens
}

/** Spaces as one `' '`; names and units lower-cased, as CSS reads them, but not a custom property's name. */
function normalized(token: string): string {
  if (/^\s+$/.test(token)) return ' '
  return token.startsWith('var(') ? token : token.toLowerCase()
}

/** How deep parentheses and functions may nest: far past any real value, far short of the stack. */
const MAX_DEPTH = 32

/** Thrown inside the reader, caught at the top: why the expression fails. */
class Failed {
  constructor(readonly issue: Issue) {}
}

/** A recursive-descent reader over the tokens, one rule per method. */
class MathReader {
  private at = 0
  private depth = 0

  constructor(
    private readonly tokens: string[],
    private readonly references: References,
  ) {}

  whole(): Kind | Issue {
    try {
      const kind = this.call()
      return this.peek() === undefined ? kind : WRONG
    } catch (failed) {
      if (failed instanceof Failed) return failed.issue
      throw failed
    }
  }

  /** `name(` arguments `)`: one for calc, three for clamp, any for min/max. */
  private call(): Kind {
    const opening = this.take()
    if (!MATH.test(opening)) throw new Failed(WRONG)
    const name = opening.slice(0, -1)
    const kinds = this.nested(() => {
      const kinds = [this.sum()]
      while (this.peek() === ',') kinds.push((this.take(), this.sum()))
      return kinds
    })
    this.expect(')')
    const counts: Record<string, boolean> = {
      calc: kinds.length === 1,
      clamp: kinds.length === 3,
    }
    if (counts[name] === false) throw new Failed(WRONG)
    return same(kinds)
  }

  /** Products joined by ` + ` or ` - `, all of one kind. */
  private sum(): Kind {
    const kinds = [this.product()]
    while (this.signAhead()) kinds.push((this.take(), this.product()))
    return same(kinds)
  }

  /** Values joined by `*` or `/`. */
  private product(): Kind {
    let kind = this.value()
    for (let op = this.peek(); op === '*' || op === '/'; op = this.peek()) {
      this.take()
      kind = times(kind, this.value(), op)
    }
    return kind
  }

  /** A number, a length, a reference, a function or a parenthesis. */
  private value(): Kind {
    const token = this.skipSpace()
    if (token === '(') return this.parenthesis()
    if (token?.endsWith('(')) return this.call()
    this.take()
    if (token?.startsWith('var(')) return this.reference(token)
    return literal(token)
  }

  private parenthesis(): Kind {
    this.take()
    const kind = this.nested(() => this.sum())
    this.expect(')')
    return kind
  }

  /**
   * One level deeper; past `MAX_DEPTH` the text is not a value a person
   * writes, and reading on would only spend the stack.
   */
  private nested<T>(read: () => T): T {
    if (++this.depth > MAX_DEPTH) throw new Failed(WRONG)
    try {
      return read()
    } finally {
      this.depth--
    }
  }

  private reference(token: string): Kind {
    const type = this.references.typeOf(token)
    if (typeof type !== 'string') throw new Failed(type)
    if (type === 'dimension') return 'length'
    if (type === 'number') return 'number'
    const name = token.slice(6, -1)
    throw new Failed({ kind: 'mistyped', name, type })
  }

  /** ` + ` or ` - ` with a space on each side: without them it's a sign. */
  private signAhead(): boolean {
    const [before, op, after] = this.tokens.slice(this.at, this.at + 3)
    return before === ' ' && (op === '+' || op === '-') && after === ' '
      ? (this.at++, true)
      : false
  }

  /** The next token past any space, without moving: a space may still be part of ` + `. */
  private peek(): string | undefined {
    let at = this.at
    while (this.tokens[at] === ' ') at++
    return this.tokens[at]
  }

  /** The next token past any space, not taken. */
  private skipSpace(): string | undefined {
    while (this.tokens[this.at] === ' ') this.at++
    return this.tokens[this.at]
  }

  private take(): string {
    const token = this.skipSpace()
    if (token === undefined) throw new Failed(WRONG)
    this.at++
    return token
  }

  private expect(token: string): void {
    if (this.take() !== token) throw new Failed(WRONG)
  }
}

function literal(token: string | undefined): Kind {
  const found = token === undefined ? undefined : dimensionOf(token)
  if (found?.unit === '') return 'number'
  if (found && isLength(found)) return 'length'
  throw new Failed(WRONG)
}

function same(kinds: Kind[]): Kind {
  if (kinds.every((kind) => kind === kinds[0])) return kinds[0]!
  throw new Failed(WRONG)
}

/** `*` keeps the kind of its non-number side; `/` needs a number on the right. */
function times(left: Kind, right: Kind, op: string): Kind {
  if (op === '/') return right === 'number' ? left : fail()
  if (left === 'number') return right
  return right === 'number' ? left : fail()
}

function fail(): never {
  throw new Failed(WRONG)
}
