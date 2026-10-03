/**
 * `bun run check:size` — lists functions longer than the limit in
 * CONTRIBUTING.md (10 lines; blank lines and comments don't count).
 *
 * It reads Prettier-formatted code line by line: a line that opens a
 * function body ends in `{` after a parameter list or `=>`. Strings,
 * template literals, comments and regular expressions are skipped, so code
 * written inside a string (a script sent to the browser) isn't measured.
 * Dev tool only: it never ships in the package.
 */
import { Glob } from 'bun'

const LIMIT = 10
const ROOT = 'packages/nexo/src'

/** A line that opens a function body (not an `if`, a class or an object). */
const OPENS_FUNCTION =
  /(\)\s*(:\s*[^={]+)?\s*(=>\s*)?\{|=>\s*\{)$|^\s*(get|set|constructor)\b.*\{$/
const CONTROL = /^\s*(\}\s*)?(if|for|while|switch|catch|else|try|do|finally)\b/
/** After one of these, a `/` starts a regular expression, not a division. */
const REGEX_AFTER = '(,=:[!&|?{};+-*%<>~^'

type Long = { file: string; line: number; lines: number; header: string }

/** What is still open where a line ends: a comment, string or regex, or nothing. */
type Open = '' | 'line' | 'block' | '"' | "'" | '`' | 'regex'

/** The state at the end of a line. */
interface LineEnd {
  depth: number
  open: Open
}

const found: Long[] = []
for await (const file of new Glob(`${ROOT}/**/*.{ts,tsx}`).scan()) {
  if (/\.test\.tsx?$/.test(file)) continue
  const source = new SourceFile(file, await Bun.file(file).text())
  found.push(...source.longFunctions())
}
report(found)

function report(long: readonly Long[]): never {
  for (const f of long) {
    console.log(`${f.file}:${f.line}  ${f.lines} lines  ${f.header.trim()}`)
  }
  const ok = long.length === 0
  console.log(
    ok
      ? `✓ every function has ${LIMIT} lines or fewer`
      : `✗ ${long.length} functions over ${LIMIT} lines`,
  )
  process.exit(ok ? 0 : 1)
}

/** One source file, and the functions in it longer than the limit. */
class SourceFile {
  private readonly lines: string[]
  private readonly ends: LineEnd[]

  constructor(
    readonly path: string,
    source: string,
  ) {
    this.lines = source.split('\n')
    this.ends = new BraceScanner(source).scan()
  }

  longFunctions(): Long[] {
    return this.lines.flatMap((header, i) => {
      if (!this.opensFunction(i)) return []
      const lines = this.bodyLength(i)
      if (lines <= LIMIT) return []
      return [{ file: this.path, line: i + 1, lines, header }]
    })
  }

  /** Code that opens a function body; never a line inside a comment or string. */
  private opensFunction(i: number): boolean {
    const text = this.lines[i]!
    if (!isCode(text) || this.ends[i - 1]?.open) return false
    return OPENS_FUNCTION.test(text.trimEnd()) && !CONTROL.test(text)
  }

  private bodyLength(start: number): number {
    const end = this.closingLine(start)
    return this.lines.slice(start + 1, end).filter(isCode).length
  }

  /** The line where the body opened on `start` closes again. */
  private closingLine(start: number): number {
    const inside = this.ends[start]!.depth
    let line = start + 1
    while (line < this.ends.length && this.ends[line]!.depth >= inside) line++
    return line
  }
}

/**
 * Walks a source character by character and records, for each line, the
 * brace depth and what is still open, ignoring the braces and quotes inside
 * strings, comments and regular expressions.
 */
class BraceScanner {
  private readonly ends: LineEnd[] = []
  private depth = 0
  private open: Open = ''
  private inClass = false // inside [...] in a regex, where '/' doesn't end it
  private last = '' // the last significant character
  private i = 0

  constructor(private readonly source: string) {}

  scan(): LineEnd[] {
    for (; this.i < this.source.length; this.i++) this.step()
    this.ends.push({ depth: this.depth, open: this.open })
    return this.ends
  }

  private step(): void {
    const c = this.source[this.i]!
    if (c === '\n') this.endLine()
    else if (this.open) this.inside(c)
    else this.code(c)
  }

  private endLine(): void {
    if (this.open === 'line') this.open = ''
    this.ends.push({ depth: this.depth, open: this.open })
  }

  private inside(c: string): void {
    if (this.open === 'line') return
    if (this.open === 'block') this.inBlock(c)
    else if (this.open === 'regex') this.inRegex(c)
    else this.inString(c)
  }

  private inBlock(c: string): void {
    if (c !== '*' || this.peek() !== '/') return
    this.open = ''
    this.i++
  }

  private inRegex(c: string): void {
    if (c === '\\') this.i++
    else if (c === '[') this.inClass = true
    else if (c === ']') this.inClass = false
    else if (c === '/' && !this.inClass) this.closeLiteral()
  }

  private inString(c: string): void {
    if (c === '\\') this.i++
    else if (c === this.open) this.closeLiteral()
  }

  private closeLiteral(): void {
    this.open = ''
    this.last = 'x'
  }

  private code(c: string): void {
    this.open = this.opening(c)
    if (this.open === 'line' || this.open === 'block') this.i++
    if (this.open) return
    if (c === '{') this.depth++
    if (c === '}') this.depth--
    if (!/\s/.test(c)) this.last = c
  }

  /** What a character starts: a comment, a regex, a string, or nothing. */
  private opening(c: string): Open {
    const next = this.peek()
    if (c === '/' && next === '/') return 'line'
    if (c === '/' && next === '*') return 'block'
    if (c === '/' && (this.last === '' || REGEX_AFTER.includes(this.last)))
      return 'regex'
    return c === '"' || c === "'" || c === '`' ? c : ''
  }

  private peek(): string | undefined {
    return this.source[this.i + 1]
  }
}

function isCode(line: string): boolean {
  const text = line.trim()
  if (text === '' || text.startsWith('//')) return false
  return !text.startsWith('*') && !text.startsWith('/*')
}
