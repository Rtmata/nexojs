/**
 * The candidate nearest to a mistyped `name`, for "did you mean …?" (C.4):
 * at most one edit for every three letters, so `primry` finds `primary`
 * and `zzz` finds nothing.
 *
 *   didYouMean('primry', ['primary', 'surface'], 'color.') // '; did you mean color.primary?'
 */
export function didYouMean(
  name: string,
  candidates: readonly string[],
  prefix = '',
): string {
  const limit = Math.max(1, Math.floor(name.length / 3))
  const near = candidates
    .map((candidate) => ({ candidate, edits: edits(name, candidate) }))
    .filter((c) => c.edits <= limit)
    .sort((a, b) => a.edits - b.edits)
  return near[0] ? `; did you mean ${prefix}${near[0].candidate}?` : ''
}

/** Levenshtein's distance: the letters to add, remove or change to go from `a` to `b`. */
function edits(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) row = nextRow(row, a[i - 1]!, b, i)
  return row[b.length]!
}

/** One row of the table: the distances from `a`'s first `i` letters to each prefix of `b`. */
function nextRow(above: number[], letter: string, b: string, i: number) {
  const row = [i]
  for (let j = 1; j <= b.length; j++) {
    const change = above[j - 1]! + (letter === b[j - 1] ? 0 : 1)
    row.push(Math.min(above[j]! + 1, row[j - 1]! + 1, change))
  }
  return row
}
