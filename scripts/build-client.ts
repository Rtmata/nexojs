/**
 * The client modules built for apps whose bundler isn't Bun (F.2, R.18):
 * one `bun build` of every subpath marked `nexo-built` in the package's
 * `exports`, each piece a pattern matches included, with `splitting` so
 * code they share (omino's `Element`) exists once. The same transform as bridge's script: target browser, ESM, nothing
 * minified. `--watch` keeps it up to date; an app's Vite picks the files up
 * through `resolve.conditions: ['nexo-built', ...defaultClientConditions]`.
 *
 *   bun run build:client            once
 *   bun run build:client --watch    while developing Archive
 */
import { resolve } from 'node:path'

const PACKAGE = resolve(import.meta.dir, '../packages/nexo')
const CONDITION = 'nexo-built'

type Exports = Record<string, string | Record<string, unknown>>

/** Each built subpath's source, from the one list there is: `exports`. */
export async function entries(): Promise<string[]> {
  const pkg = await Bun.file(`${PACKAGE}/package.json`).json()
  const sources = Object.values(pkg.exports as Exports)
    .filter((target) => typeof target === 'object' && CONDITION in target)
    .map((target) => (target as { default: string }).default)
  return (await Promise.all(sources.map(expanded))).flat()
}

/**
 * A source as files: a pattern (`./src/client/panel/pieces/*.ts`) stands
 * for every file it matches. Its `*` may hold a `/`, as in Node's own
 * patterns (`theater/easing/back`), so the glob is `**` deep.
 */
async function expanded(source: string): Promise<string[]> {
  if (!source.includes('*')) return [source]
  const glob = new Bun.Glob(source.slice(2).replace('*', '**/*'))
  const files = await Array.fromAsync(glob.scan({ cwd: PACKAGE }))
  return files.sort().map((file) => `./${file}`)
}

export async function command(
  outdir: string,
  watch: boolean,
): Promise<string[]> {
  const flags = ['--target=browser', '--format=esm', '--splitting']
  const place = ['--root=src', `--outdir=${outdir}`]
  return [
    'bun',
    'build',
    ...(await entries()),
    ...flags,
    ...place,
    ...(watch ? ['--watch'] : []),
  ]
}

if (import.meta.main) {
  const outdir =
    Bun.argv.find((a) => a.startsWith('--outdir='))?.slice(9) ?? 'dist'
  const cmd = await command(outdir, Bun.argv.includes('--watch'))
  const child = Bun.spawn(cmd, {
    cwd: PACKAGE,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  process.exit(await child.exited)
}
