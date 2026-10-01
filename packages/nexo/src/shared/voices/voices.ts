/**
 * The interface's words in every language. Messages are plain values and
 * functions you write; voices only checks that every language says
 * everything, and hands you the right set:
 *
 *   const t = voices(['en', 'es'], {
 *     en: { consoles: 'Consoles', games: (n: number) => quarry('en').plural(n, { one: '# game', other: '# games' }) },
 *     es: { consoles: 'Consolas', games: (n: number) => quarry('es').plural(n, { one: '# juego', other: '# juegos' }) },
 *   })
 *
 *   t('es').consoles   // 'Consolas'
 *   t('es').games(12)  // '12 juegos'
 *
 * The language list is a plain array, so voices works with any router — or
 * none. With boat: `voices(router.languages, …)`.
 */
export type Voices<L extends string, M> = (lang?: L) => M

export function voices<
  const L extends string,
  const Messages extends { [K in L]: object },
>(languages: readonly L[], messages: Messages): Voices<L, Messages[L]> {
  if (languages.length === 0) {
    throw new Error('voices: give at least one language')
  }
  check(languages, messages)
  return (lang = languages[0]!) => {
    const found = messages[lang]
    if (!found) {
      throw new Error(
        `voices: there are no messages for "${lang}" (languages: ${languages.join(', ')})`,
      )
    }
    return found
  }
}

/**
 * Every language must have every message the others have, with the same
 * kind (text, function, group). Problems are all listed at once, at startup.
 */
function check(
  languages: readonly string[],
  messages: Record<string, unknown>,
) {
  const problems: string[] = []
  for (const lang of Object.keys(messages)) {
    if (!languages.includes(lang)) {
      problems.push(
        `"${lang}" is not one of the languages (${languages.join(', ')})`,
      )
    }
  }
  const present = languages.filter((lang) => {
    if (messages[lang] === undefined) problems.push(`"${lang}" has no messages`)
    return messages[lang] !== undefined
  })

  const shapes = new Map<string, Map<string, string>>()
  for (const lang of present) shapes.set(lang, shapeOf(messages[lang]))
  const keys = new Set(
    [...shapes.values()].flatMap((shape) => [...shape.keys()]),
  )

  for (const key of [...keys].sort()) {
    const kinds = new Map<string, string[]>()
    for (const lang of present) {
      const kind = shapes.get(lang)!.get(key)
      if (!kind) problems.push(`"${lang}" is missing "${key}"`)
      else kinds.set(kind, [...(kinds.get(kind) ?? []), lang])
    }
    if (kinds.size > 1) {
      const described = [...kinds].map(
        ([kind, langs]) => `${kind} in ${langs.join(', ')}`,
      )
      problems.push(`"${key}" is ${described.join(' but ')}`)
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `voices: the languages don't match:\n  ${problems.join('\n  ')}`,
    )
  }
}

/** Every message path and its kind: `{ nav: { home: 'Home' } }` → `nav.home` → text. */
function shapeOf(
  value: unknown,
  prefix = '',
  shape = new Map<string, string>(),
) {
  for (const [key, inner] of Object.entries(value as object)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof inner === 'function') shape.set(path, 'a function')
    else if (inner !== null && typeof inner === 'object') {
      shape.set(path, 'a group')
      shapeOf(inner, path, shape)
    } else shape.set(path, 'text')
  }
  return shape
}
