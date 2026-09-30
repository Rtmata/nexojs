import { describe, expect, test } from 'bun:test'
import { Component, Slot } from './component'
import { raw, type Child } from './element'
import { render, renderToString } from './render'

describe('elements', () => {
  test('renders tags, attributes and text', async () => {
    expect(
      await renderToString(
        <a href="/consola/nes" title="NES">
          Ver sala
        </a>,
      ),
    ).toBe('<a href="/consola/nes" title="NES">Ver sala</a>')
  })

  test('escapes text and attributes', async () => {
    const evil = '<script>alert("x")</script>'
    expect(await renderToString(<p title={evil}>{evil}</p>)).toBe(
      '<p title="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>',
    )
  })

  test('raw() inserts trusted HTML as is', async () => {
    expect(await renderToString(<div>{raw('<b>curated</b>')}</div>)).toBe(
      '<div><b>curated</b></div>',
    )
  })

  test('boolean attributes and empty values', async () => {
    expect(
      await renderToString(
        <input
          disabled={true}
          hidden={false}
          value=""
          placeholder={undefined}
        />,
      ),
    ).toBe('<input disabled value="">')
  })

  test('void elements have no closing tag', async () => {
    expect(await renderToString(<img src="nes.png" alt="NES" />)).toBe(
      '<img src="nes.png" alt="NES">',
    )
  })

  test('lists, numbers, booleans and fragments', async () => {
    const games = ['Zelda', 'Metroid']
    expect(
      await renderToString(
        <>
          <ul>
            {games.map((g) => (
              <li>{g}</li>
            ))}
          </ul>
          {1985}
          {false}
          {null}
        </>,
      ),
    ).toBe('<ul><li>Zelda</li><li>Metroid</li></ul>1985')
  })

  test('if renders only when truthy', async () => {
    expect(
      await renderToString(
        <p>
          <span if={true}>sí</span>
          <span if={0}>no</span>
        </p>,
      ),
    ).toBe('<p><span>sí</span></p>')
  })

  test('class accepts strings, lists and objects', async () => {
    const size: string | undefined = undefined
    expect(
      await renderToString(
        <button
          class={[
            'btn',
            'btn-primary',
            size && `btn-${size}`,
            { 'btn-disabled': true, active: false },
          ]}
        />,
      ),
    ).toBe('<button class="btn btn-primary btn-disabled"></button>')
    expect(await renderToString(<i class={[false, null]} />)).toBe('<i></i>')
  })

  test('refuses event handlers and bad names with a clear error', async () => {
    await expect(renderToString(<button onclick={() => {}} />)).rejects.toThrow(
      'event handlers',
    )
    await expect(
      renderToString({ type: 'bad tag', props: {} }),
    ).rejects.toThrow('invalid tag')
  })

  test('script and style content is raw text, not escaped', async () => {
    const json = JSON.stringify({ '@type': 'VideoGame', name: 'Zelda "II"' })
    expect(
      await renderToString(<script type="application/ld+json">{json}</script>),
    ).toBe(`<script type="application/ld+json">${json}</script>`)
    expect(await renderToString(<style>{'a > b { color: red }'}</style>)).toBe(
      '<style>a > b { color: red }</style>',
    )
  })

  test('a closing tag inside script text cannot break out', async () => {
    expect(
      await renderToString(<script>{'let s = "</SCRIPT><b>x"'}</script>),
    ).toBe('<script>let s = "<\\/SCRIPT><b>x"</script>')
  })

  test('script and style refuse markup children', async () => {
    await expect(
      renderToString(
        <script>
          <b>x</b>
        </script>,
      ),
    ).rejects.toThrow('only accepts text')
  })
})

describe('components', () => {
  type BadgeProps = { tone?: string; size?: 'sm' | 'md' }

  class Badge extends Component<BadgeProps> {
    static defaults: Partial<BadgeProps> = { tone: 'gray', size: 'md' }
    template() {
      const { tone, size } = this.props
      return (
        <span class={['badge', `badge-${tone}`, `badge-${size}`]}>
          {this.props.children}
        </span>
      )
    }
  }

  class GoldBadge extends Badge {
    static defaults: Partial<BadgeProps> = { tone: 'gold' }
  }

  test('props, defaults and children', async () => {
    expect(await renderToString(<Badge>3ª gen</Badge>)).toBe(
      '<span class="badge badge-gray badge-md">3ª gen</span>',
    )
    expect(await renderToString(<Badge tone="blue">x</Badge>)).toBe(
      '<span class="badge badge-blue badge-md">x</span>',
    )
  })

  test('subclasses override only what changes', async () => {
    expect(await renderToString(<GoldBadge>x</GoldBadge>)).toBe(
      '<span class="badge badge-gold badge-md">x</span>',
    )
    expect(await renderToString(<GoldBadge size="sm">x</GoldBadge>)).toBe(
      '<span class="badge badge-gold badge-sm">x</span>',
    )
  })

  test('if also works on components', async () => {
    expect(await renderToString(<Badge if={false}>x</Badge>)).toBe('')
  })

  test('template() can be async', async () => {
    class Related extends Component<{ id: string }> {
      async template() {
        const games = await Promise.resolve([
          `${this.props.id}-1`,
          `${this.props.id}-2`,
        ])
        return (
          <ul>
            {games.map((g) => (
              <li>{g}</li>
            ))}
          </ul>
        )
      }
    }
    expect(await renderToString(<Related id="nes" />)).toBe(
      '<ul><li>nes-1</li><li>nes-2</li></ul>',
    )
  })

  test('plain functions are rejected with a clear error', async () => {
    const NotAClass = () => <p />
    await expect(
      renderToString({ type: NotAClass as any, props: {} }),
    ).rejects.toThrow('extend Component')
  })
})

describe('slots', () => {
  class Card extends Component {
    template() {
      return (
        <article>
          <header>
            <Slot name="header" />
          </header>
          <Slot />
          <footer>
            <Slot name="footer">Gaming Reservoir</Slot>
          </footer>
        </article>
      )
    }
  }

  test('children go to their slot; unnamed ones to <Slot />', async () => {
    expect(
      await renderToString(
        <Card>
          <h2 slot="header">NES</h2>
          <p>La consola que salvó la industria.</p>
          <a slot="footer" href="/consola/nes">
            Ver sala
          </a>
        </Card>,
      ),
    ).toBe(
      '<article><header><h2>NES</h2></header><p>La consola que salvó la industria.</p><footer><a href="/consola/nes">Ver sala</a></footer></article>',
    )
  })

  test('a slot shows its fallback when nothing is passed', async () => {
    expect(await renderToString(<Card>solo texto</Card>)).toBe(
      '<article><header></header>solo texto<footer>Gaming Reservoir</footer></article>',
    )
  })

  test('rendering children directly shows only the unnamed ones', async () => {
    class Plain extends Component {
      template() {
        return <div>{this.props.children}</div>
      }
    }
    expect(
      await renderToString(
        <Plain>
          <h2 slot="header">oculto</h2>
          <p>visible</p>
        </Plain>,
      ),
    ).toBe('<div><p>visible</p></div>')
  })

  test('slot children inside fragments reach their slot', async () => {
    expect(
      await renderToString(
        <Card>
          <>
            <h2 slot="header">NES</h2>
            <p>texto</p>
          </>
        </Card>,
      ),
    ).toBe(
      '<article><header><h2>NES</h2></header><p>texto</p><footer>Gaming Reservoir</footer></article>',
    )
  })

  test('a slot child with a falsy if leaves the fallback in place', async () => {
    expect(
      await renderToString(
        <Card>
          <a slot="footer" if={false}>
            no
          </a>
          texto
        </Card>,
      ),
    ).toBe(
      '<article><header></header>texto<footer>Gaming Reservoir</footer></article>',
    )
  })

  test('slot is a normal attribute when not a direct child of a component', async () => {
    expect(
      await renderToString(
        <my-element>
          <span slot="icon">★</span>
        </my-element>,
      ),
    ).toBe('<my-element><span slot="icon">★</span></my-element>')
  })

  test('slots keep the scope where they were written', async () => {
    // Layout passes its own "title" slot down into Card's header.
    class Layout extends Component {
      template() {
        return (
          <Card>
            <h1 slot="header">
              <Slot name="title" />
            </h1>
            <Slot />
          </Card>
        )
      }
    }

    expect(
      await renderToString(
        <Layout>
          <span slot="title">Consolas</span>
          contenido
        </Layout>,
      ),
    ).toBe(
      '<article><header><h1><span>Consolas</span></h1></header>contenido<footer>Gaming Reservoir</footer></article>',
    )
  })
})

describe('render', () => {
  test('answers with a doctype and an HTML content type', async () => {
    const response = await render(<h1>Museo</h1>)
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8',
    )
    expect(await response.text()).toBe('<!doctype html><h1>Museo</h1>')
  })

  test('keeps status and custom headers', async () => {
    const response = await render(<h1>Sala perdida</h1>, {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    })
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

// Type-level checks: each marked line must fail to compile for the stated
// reason. Never called; it only exists for `tsc`.
class Titled extends Component<{ title: string }> {
  template(): Child {
    return <h2>{this.props.title}</h2>
  }
}

export function typeChecks() {
  return [
    <Titled title="ok" />,
    <Titled title="ok" if={false} slot="x" />,
    // @ts-expect-error unknown prop on a component
    <Titled title="ok" tone="x" />,
    // @ts-expect-error missing required prop
    <Titled />,
    // @ts-expect-error key does nothing in omino, so it is not accepted
    <Titled title="ok" key="1" />,
  ]
}
