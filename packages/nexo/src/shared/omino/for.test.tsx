import { describe, expect, test } from 'bun:test'
import { For, render } from './index'

describe('For on the server', () => {
  test('lists every item once, as fixed values', async () => {
    const books = {
      get: () => [
        { id: 1, title: 'Dune' },
        { id: 2, title: 'Emma' },
      ],
    }
    const page = (
      <ul>
        <For each={books} key={(book) => book.id}>
          {(book, index) => (
            <li>
              {index.get()}:{book.get().title}
            </li>
          )}
        </For>
      </ul>
    )
    const html = await (await render(page)).text()
    expect(html).toContain('<ul><li>0:Dune</li><li>1:Emma</li></ul>')
  })
})
