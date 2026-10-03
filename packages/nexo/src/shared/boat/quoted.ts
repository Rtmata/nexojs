/** `['es', 'en']` → `"es", "en"`: names in error messages, always quoted alike. */
export function quoted(list: readonly string[]): string {
  return list.map((item) => `"${item}"`).join(', ')
}
