/** A token's name as it may follow `--`: the one rule every glyph name keeps. */
const NAME = String.raw`[A-Za-z0-9_-]+`

/** `var(--name)` as a pattern's source, for readers that put it among others. */
export const REFERENCE_SOURCE = String.raw`var\(--(${NAME})\)`

/** Every `var(--name)` in a value: `0 1px var(--color-text)`. */
export function referencesIn(text: string): string[] {
  return [...text.matchAll(new RegExp(REFERENCE_SOURCE, 'g'))].map((m) => m[1]!)
}

/** A value with each `var(--name)` replaced. */
export function replaceReferences(
  text: string,
  by: (name: string) => string,
): string {
  return text.replace(new RegExp(REFERENCE_SOURCE, 'g'), (_, name: string) =>
    by(name),
  )
}

/** The name when `text` is one whole reference, no fallback: `var(--blue-500)` → `blue-500`. */
export function referenceName(text: string): string | undefined {
  return new RegExp(`^${REFERENCE_SOURCE}$`).exec(text.trim())?.[1]
}
