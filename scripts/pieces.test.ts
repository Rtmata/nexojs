/**
 * Per-piece imports (A.1b): importing one piece through a module's index
 * bundles no more than importing that piece by its own path. It holds
 * because the package declares `sideEffects` (only bridge's script acts
 * on import) and every index only lists its pieces.
 */
import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SRC = resolve(import.meta.dir, '../packages/nexo/src')

/** One piece per module, and one imported name from it. */
const CASES: [module: string, piece: string, name: string][] = [
  ['shared/connector/index.ts', 'shared/connector/pieces/signal.ts', 'signal'],
  ['shared/omino/index.ts', 'shared/omino/pieces/for.ts', 'For'],
  ['shared/boat/index.ts', 'shared/boat/pieces/route.ts', 'route'],
  ['client/boat/index.ts', 'client/boat/pieces/sources.ts', 'historyUrl'],
  ['shared/terminal/index.ts', 'shared/terminal/pieces/http.ts', 'http'],
  ['client/panel/index.ts', 'client/panel/pieces/tabs.ts', 'tabs'],
  ['client/panel/index.ts', 'client/panel/pieces/drag.ts', 'drag'],
  ['client/theater/index.ts', 'client/theater/pieces/animate.ts', 'animate'],
  ['client/theater/index.ts', 'client/theater/pieces/scroll.ts', 'scroll'],
  [
    'shared/glyph/index.ts',
    'shared/glyph/pieces/define-tokens.ts',
    'defineTokens',
  ],
  ['shared/glyph/index.ts', 'shared/glyph/pieces/readable-on.ts', 'readableOn'],
  [
    'shared/glyph/index.ts',
    'shared/glyph/pieces/define-theme.ts',
    'defineTheme',
  ],
  ['client/glyph/index.ts', 'client/glyph/pieces/adopt-theme.ts', 'adoptTheme'],
]

/** The minified bundle of an entry that imports `name` from `file` and keeps it. */
async function bundled(
  dir: string,
  file: string,
  name: string,
): Promise<number> {
  const entry = join(dir, `${name}-${file.replaceAll('/', '_')}`)
  await writeFile(
    entry,
    `import { ${name} } from '${join(SRC, file)}'\nconsole.log(${name})\n`,
  )
  const built = await Bun.build({
    entrypoints: [entry],
    minify: true,
    target: 'browser',
  })
  if (!built.success)
    throw new AggregateError(built.logs, `pieces: ${file} did not build`)
  return (await built.outputs[0]!.text()).length
}

describe('per-piece imports (A.1b)', () => {
  test.each(CASES)(
    '%s → %s: the index bundles no more than the piece',
    async (module, piece, name) => {
      const dir = await mkdtemp(join(tmpdir(), 'nexo-pieces-'))
      try {
        const [fromIndex, fromPiece] = await Promise.all([
          bundled(dir, module, name),
          bundled(dir, piece, name),
        ])
        expect(fromIndex).toBeLessThanOrEqual(fromPiece + 64) // a few bytes of naming at most
      } finally {
        await rm(dir, { recursive: true })
      }
    },
  )
})
