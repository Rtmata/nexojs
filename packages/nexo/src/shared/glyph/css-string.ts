/**
 * `text` inside a CSS string: each character that could end the string, the
 * rule or the `<style>` around it — quote, backslash, `<`, `>`, a control
 * character — written as its hex escape, which CSS reads back as itself.
 * A name from a person's JSON can't step outside it: a theme's selector,
 * a font's family, a file's `url()`.
 */
export function cssString(text: string): string {
  return text.replace(
    /[\\"<>\u0000-\u001f\u007f]/g,
    (c) => `\\${c.codePointAt(0)!.toString(16)} `,
  )
}
