/**
 * `text` cut at each `separator` outside parentheses and quotes, each part
 * trimmed: `0 1px rgb(0 0 0)` → `0`, `1px`, `rgb(0 0 0)`. Spaces cut at any
 * run of whitespace; commas keep empty parts, so `a,,b` shows one.
 * `undefined` when a parenthesis or a quote is left open.
 */
export function splitTop(
  text: string,
  separator: ',' | ' ',
): string[] | undefined {
  const cutter = new Cutter(separator)
  for (const char of text) cutter.read(char)
  return cutter.parts()
}

/** Reads one character at a time, keeping depth and the open quote. */
class Cutter {
  private readonly done: string[] = []
  private current = ''
  private depth = 0
  private quote = ''

  constructor(private readonly separator: ',' | ' ') {}

  read(char: string): void {
    if (this.quote) return this.inQuote(char)
    if (this.cutsAt(char)) return this.cut()
    if (char === '"' || char === "'") this.quote = char
    if (char === '(') this.depth++
    if (char === ')') this.depth--
    this.current += char
  }

  parts(): string[] | undefined {
    if (this.depth !== 0 || this.quote) return undefined
    this.cut()
    return this.separator === ' '
      ? this.done.filter((part) => part !== '')
      : this.done
  }

  private inQuote(char: string): void {
    if (char === this.quote) this.quote = ''
    this.current += char
  }

  private cutsAt(char: string): boolean {
    if (this.depth !== 0) return false
    return this.separator === ' ' ? /\s/.test(char) : char === ','
  }

  private cut(): void {
    this.done.push(this.current.trim())
    this.current = ''
  }
}
