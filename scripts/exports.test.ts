/**
 * The exports map: one pattern per module's `pieces/` folder, so a
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

/** Every public path before the pieces became patterns (85507d5): none may be lost. */
const FORMER = [
  'boat',
  'boat/client',
  'boat/client/not-found',
  'boat/client/router',
  'boat/client/routes',
  'boat/client/sources',
  'boat/not-found',
  'boat/redirect',
  'boat/route',
  'boat/router',
  'bridge',
  'bridge/client',
  'connector',
  'connector/batch',
  'connector/computed',
  'connector/debounce',
  'connector/debounced-value',
  'connector/effect',
  'connector/event',
  'connector/media-query',
  'connector/resource',
  'connector/schedulers',
  'connector/signal',
  'connector/signal-array',
  'connector/signal-date',
  'connector/signal-map',
  'connector/signal-set',
  'connector/signal-url',
  'connector/snapshot',
  'connector/untrack',
  'connector/watch',
  'keep',
  'omino',
  'omino/client',
  'omino/component',
  'omino/css',
  'omino/for',
  'omino/jsx-dev-runtime',
  'omino/jsx-runtime',
  'omino/raw',
  'omino/render',
  'omino/segment',
  'omino/swap',
  'panel',
  'panel/accordion',
  'panel/activity',
  'panel/carousel',
  'panel/close-top',
  'panel/combobox',
  'panel/confirm-on-hold',
  'panel/core',
  'panel/decode',
  'panel/dialog',
  'panel/drag',
  'panel/feed',
  'panel/focusgroup',
  'panel/gesture',
  'panel/grid',
  'panel/hover-intent',
  'panel/indicator',
  'panel/keymap',
  'panel/listbox',
  'panel/menu',
  'panel/parallax',
  'panel/params',
  'panel/pinch',
  'panel/press-hold',
  'panel/replay',
  'panel/reveal',
  'panel/sequence',
  'panel/slider',
  'panel/splitter',
  'panel/switch',
  'panel/tabs',
  'panel/toast',
  'panel/tokens',
  'panel/tooltip',
  'panel/tree',
  'panel/typewriter',
  'quarry',
  'terminal',
  'terminal/client',
  'terminal/errors',
  'terminal/http',
  'terminal/server',
  'terminal/tauri',
  'terminal/terminal',
  'terminal/validators',
  'theater',
  'theater/animate',
  'theater/drag',
  'theater/easing',
  'theater/easing/back',
  'theater/easing/bounce',
  'theater/easing/circ',
  'theater/easing/cubic',
  'theater/easing/elastic',
  'theater/easing/expo',
  'theater/easing/quad',
  'theater/easing/quart',
  'theater/easing/quint',
  'theater/easing/sine',
  'theater/finished',
  'theater/flashes',
  'theater/flashes-predicted',
  'theater/follow',
  'theater/in-view',
  'theater/layout',
  'theater/parallax',
  'theater/pinch',
  'theater/reduce',
  'theater/scroll',
  'theater/scroll-to',
  'theater/smooth-wheel',
  'theater/speed',
  'theater/stagger',
  'theater/test-clock',
  'theater/tween',
  'theater/view',
  'voices',
  'witness',
]

/** The three paths renamed on purpose when each piece was named after what it gives. */
const RENAMED: Record<string, string> = {
  'theater/view': 'theater/animate-view',
  'theater/reduce': 'theater/reduced-motion',
  'theater/flashes-predicted': 'theater/predict-flashes',
}

const kept = FORMER.filter((path) => !(path in RENAMED))

describe('the exports map', () => {
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

  test.each(kept)('%s, a former path, still resolves', (path) => {
    expect(() => Bun.resolveSync(`${NAME}/${path}`, FROM)).not.toThrow()
  })

  test.each(Object.entries(RENAMED))('%s is now %s', (before, after) => {
    expect(() => Bun.resolveSync(`${NAME}/${before}`, FROM)).toThrow()
    expect(() => Bun.resolveSync(`${NAME}/${after}`, FROM)).not.toThrow()
  })

  test('flashes and test-clock run beside the browser: no browser build', () => {
    for (const key of ['./theater/flashes', './theater/test-clock'])
      expect(pkg.exports[key]).toStartWith('./src/shared/theater/')
  })

  test('a piece imported through a pattern works', async () => {
    const { backOut } = await import(
      Bun.resolveSync(`${NAME}/theater/easing/back`, FROM)
    )
    expect(backOut(1)).toBeCloseTo(1, 9)
  })
})
