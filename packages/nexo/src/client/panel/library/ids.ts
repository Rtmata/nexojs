const made = new Map<string, number>()

/**
 * An id no element of the document has: `wanted` itself when it's free
 * (`info-title`), else `wanted-2`, `wanted-3`… For the ARIA relations
 * panels add (`aria-labelledby`, `aria-controls`, `aria-activedescendant`).
 */
export function uniqueId(wanted: string): string {
  if (!document.getElementById(wanted)) return wanted
  let n = made.get(wanted) ?? 1
  let id = `${wanted}-${++n}`
  while (document.getElementById(id)) id = `${wanted}-${++n}`
  made.set(wanted, n)
  return id
}
