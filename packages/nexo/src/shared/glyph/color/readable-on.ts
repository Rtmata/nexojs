import { contrastRatio } from './contrast'

/**
 * The candidate with the best WCAG 2.2 contrast on `background`: any
 * colours, not only black and white. On a tie the first written wins. It
 * returns the candidate as written; whether it is enough is for the
 * checks to say, since the best may still fall short.
 *
 *   readableOn('#3b82f6', ['#fff', '#0f172a']) // '#0f172a'
 */
export function readableOn(
  background: string,
  candidates: readonly string[],
): string {
  if (candidates.length === 0)
    throw new Error('glyph: readableOn needs at least one candidate colour')
  const ratios = candidates.map((candidate) =>
    contrastRatio(candidate, background),
  )
  return candidates[ratios.indexOf(Math.max(...ratios))]!
}
