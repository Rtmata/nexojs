/**
 * The exports map: one pattern per module's `pieces/` folder (A.1b), so a
 * piece's import path is its file name there. These check that Bun, from
 * inside the package as from an app, finds every piece by that path, and
 * that the exact keys (indexes, JSX runtimes, bridge's script) still win.
 */
import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

const PACKAGE = resolve(import.meta.dir, '../packages/nexo')
const NAME = '@nexoamigos/nexo'
const FROM = `${PACKAGE}/src/index.ts` // any file inside: self-reference

type Target = string | { default: string }

const pkg = await Bun.file(`${PACKAGE}/package.json`).json()
const exports = Object.entries(pkg.exports as Record<string, Target>)

/** The source a key points at. */
function sourceOf(target: Target): string {
  return typeof target === 'string' ? target : target.default
}

/** Every `[import path, file]` a pattern key stands for. */
function piecesOf(key: string, target: Target): [string, string][] {
  const source = sourceOf(target).slice(2)
  const glob = new Bun.Glob(source.replace('*', '**/*'))
  const [before, after] = source.split('*') as [string, string]
  return [...glob.scanSync({ cwd: PACKAGE })].map((file) => [
    `${NAME}/${key.slice(2).replace('*', file.slice(before.length, -after.length))}`,
    `${PACKAGE}/${file}`,
  ])
}

const patterns = exports.filter(([key]) => key.includes('*'))
const exact = exports.filter(([key]) => !key.includes('*'))
const pieces = patterns.flatMap(([key, target]) => piecesOf(key, target))

describe('the exports map (A.1b)', () => {
  test('every pattern points at a pieces/ folder', () => {
    for (const [, target] of patterns)
      expect(sourceOf(target)).toMatch(/\/pieces\/\*\.ts$/)
  })

  test.each(pieces)('%s is its file in pieces/', (path, file) => {
    expect(Bun.resolveSync(path, FROM)).toBe(file)
  })

  test.each(exact)(
    '%s, an exact key, wins over the patterns',
    (key, target) => {
      const path = key === '.' ? NAME : `${NAME}/${key.slice(2)}`
      expect(Bun.resolveSync(path, FROM)).toBe(
        resolve(PACKAGE, sourceOf(target)),
      )
    },
  )

  test('a piece imported through a pattern works', async () => {
    const { backOut } = await import(
      Bun.resolveSync(`${NAME}/theater/easing/back`, FROM)
    )
    expect(backOut(1)).toBeCloseTo(1, 9)
  })
})
