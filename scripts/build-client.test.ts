import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { entries } from './build-client'

const out = mkdtempSync(join(tmpdir(), 'nexo-built-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

/** Every .js under a folder. */
function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(dir, f))
}

describe('the client build (F.2)', () => {
  test('every nexo-built subpath gets its file, shared code once', async () => {
    const build = Bun.spawnSync([
      'bun',
      resolve(import.meta.dir, 'build-client.ts'),
      `--outdir=${out}`,
    ])
    expect(build.exitCode).toBe(0)
    for (const source of await entries()) {
      const built = source.replace('./src/', '').replace(/\.ts$/, '.js')
      expect(files(out)).toContain(join(out, built))
    }
    const defining = files(out).filter(
      (f) => /class Element\d*\s*\{/.test(readFileSync(f, 'utf8')), // Bun 1.4 names it Element2: the DOM has an Element
    )
    expect(defining).toHaveLength(1)
  })

  test('the list is the exports map: every nexo-built subpath, every piece', async () => {
    const pkg = await Bun.file(
      resolve(import.meta.dir, '../packages/nexo/package.json'),
    ).json()
    const marked = Object.values(pkg.exports).filter(
      (target) => typeof target === 'object',
    )
    const listed = await entries()
    expect(listed.length).toBeGreaterThan(marked.length) // patterns grow into pieces
    expect(listed).toContain('./src/client/boat/index.ts')
    expect(listed).toContain('./src/client/panel/pieces/tabs.ts')
    expect(listed).toContain('./src/client/theater/pieces/easing/back.ts')
    expect(listed.filter((source) => source.includes('*'))).toEqual([])
  })
})
