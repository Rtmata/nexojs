/**
 * The candidate nearest to a mistyped `name` (C.4), as rustc finds one:
 * edits counted with neighbours swapped as one and case ignored, at most
 * one for every three letters, rounded up — so `primry`, `pirmary`,
 * `Primary` and `srfce` find their name, and `zzz` finds nothing.
 *
 *   closest('primry', ['primary', 'surface']) // 'primary'
 */
export function closest(
  name: string,
  candidates: readonly string[],
): string | undefined {
  const limit = Math.max(1, Math.ceil(name.length / 3))
  const near = candidates
    .map((candidate) => ({ candidate, edits: edits(name, candidate) }))
    .filter((c) => c.edits <= limit)
    .sort((a, b) => a.edits - b.edits)
  return near[0]?.candidate
}

/**
 * "did you mean …?" for a message, or nothing when no candidate is near.
 *
 *   didYouMean('primry', ['primary', 'surface'], 'color.') // '; did you mean color.primary?'
 */
export function didYouMean(
  name: string,
  candidates: readonly string[],
  prefix = '',
): string {
  const near = closest(name, candidates)
  return near === undefined ? '' : `; did you mean ${prefix}${near}?`
}

/**
 * Optimal string alignment, Damerau-Levenshtein's restricted form: the
 * letters to add, remove or change to go from `a` to `b`, two neighbours
 * swapped counting as one. Upper and lower case are the same letter.
 */
function edits(a: string, b: string): number {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()]
  const table = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  )
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++) table[i]![j] = cell(table, x, y, i, j)
  return table[x.length]![y.length]!
}

/** The distance from `x`'s first `i` letters to `y`'s first `j`, from the cells before it. */
function cell(
  table: number[][],
  x: string,
  y: string,
  i: number,
  j: number,
): number {
  const at = (i: number, j: number) => table[i]![j]!
  const change = at(i - 1, j - 1) + (x[i - 1] === y[j - 1] ? 0 : 1)
  const best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, change)
  const swapped =
    i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]
  return swapped ? Math.min(best, at(i - 2, j - 2) + 1) : best
}
