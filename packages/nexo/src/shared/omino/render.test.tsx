import { describe, expect, test } from 'bun:test'
import { Component, Slot, type ComponentProps } from './component'
import { raw, type Child, type Element } from './element'
import { jsx } from './jsx-runtime'
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

  test('void elements accept children that render nothing, not others', async () => {
    const show = false
    expect(await renderToString(<br>{show && 'x'}</br>)).toBe('<br>')
    expect(await renderToString(<img>{''}</img>)).toBe('<img>')
    expect(await renderToString(<hr>{[]}</hr>)).toBe('<hr>')
    await expect(renderToString(<br>x</br>)).rejects.toThrow(
      "can't have children",
    )
  })

  test('a data record is never mistaken for an element', async () => {
    const record = { type: 'consola', props: { id: 'nes' } }
    await expect(renderToString(record as any)).rejects.toThrow("can't render")
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
      'no event handlers',
    )
    // Also as text, which is how injected data would arrive.
    await expect(
      renderToString(<img src="x" onError="alert(1)" />),
    ).rejects.toThrow('no event handlers')
    await expect(renderToString(jsx('bad tag', {}))).rejects.toThrow(
      'is not a tag name',
    )
  })

  test('key is rejected on elements too', () => {
    expect(() => jsx('li', {}, '1')).toThrow('does nothing')
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

  test('neutralized script text is still valid JSON and JS', async () => {
    const data = { html: '<script>x</script>', note: '<!--<script' }
    const page = await renderToString(
      <script type="application/ld+json">{JSON.stringify(data)}</script>,
    )
    const inner = page.slice(
      '<script type="application/ld+json">'.length,
      -'</script>'.length,
    )
    expect(inner).not.toContain('<script')
    expect(inner).not.toContain('</script')
    expect(JSON.parse(inner)).toEqual(data)
    expect(new Function(`return ${inner}`)()).toEqual(data)
  })

  test('a slot can be placed inside script or style', async () => {
    class Inline extends Component {
      template() {
        return (
          <script>
            <Slot>console.log(1)</Slot>
          </script>
        )
      }
    }
    // Fallback text, then text passed as children.
    expect(await renderToString(<Inline />)).toBe(
      '<script>console.log(1)</script>',
    )
    expect(await renderToString(<Inline>{'let a = 2'}</Inline>)).toBe(
      '<script>let a = 2</script>',
    )
    // Markup is still refused, even through a slot.
    await expect(
      renderToString(
        <Inline>
          <b>x</b>
        </Inline>,
      ),
    ).rejects.toThrow('only accepts text')
  })

  test('an opening script tag inside script text is neutralized too', async () => {
    // `<!--<script` would otherwise start the "double escaped" state, in
    // which the real closing tag no longer ends the element.
    expect(
      await renderToString(<script>{'x = "<!--<script>"; y = 1'}</script>),
    ).toBe('<script>x = "<!--<\\u0073cript>"; y = 1</script>')
    expect(
      await renderToString(<style>{'a::after { content: "<script>" }'}</style>),
    ).toBe('<style>a::after { content: "<script>" }</style>')
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

  test('a prop passed as undefined keeps its default', async () => {
    const size: 'sm' | undefined = undefined
    expect(await renderToString(<Badge size={size}>x</Badge>)).toBe(
      '<span class="badge badge-gray badge-md">x</span>',
    )
  })

  test('children can have a default', async () => {
    class Labeled extends Component<{ tone?: string }> {
      static defaults: Partial<ComponentProps<{ tone?: string }>> = {
        children: 'sin nombre',
      }
      template() {
        return <b>{this.props.children}</b>
      }
    }
    expect(await renderToString(<Labeled />)).toBe('<b>sin nombre</b>')
    expect(await renderToString(<Labeled>NES</Labeled>)).toBe('<b>NES</b>')

    // Default children are visible to <Slot /> too.
    class Slotted extends Labeled {
      template() {
        return (
          <i>
            <Slot />
          </i>
        )
      }
    }
    expect(await renderToString(<Slotted />)).toBe('<i>sin nombre</i>')
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
    await expect(renderToString(jsx(NotAClass as any, {}))).rejects.toThrow(
      'extend Component',
    )
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

  test('named children are not forwarded through another component', async () => {
    class Wrapper extends Component {
      template() {
        return <Card>{this.props.children}</Card>
      }
    }
    expect(
      await renderToString(
        <Wrapper>
          <h2 slot="header">oculto</h2>
          <p>texto</p>
        </Wrapper>,
      ),
    ).toBe(
      '<article><header></header><p>texto</p><footer>Gaming Reservoir</footer></article>',
    )
  })

  test('a slot can be forwarded on purpose', async () => {
    class Forwarding extends Component {
      template() {
        return (
          <Card>
            <Slot name="header" slot="header" />
            <Slot />
          </Card>
        )
      }
    }
    expect(
      await renderToString(
        <Forwarding>
          <h2 slot="header">NES</h2>
          <p>texto</p>
        </Forwarding>,
      ),
    ).toBe(
      '<article><header><h2>NES</h2></header><p>texto</p><footer>Gaming Reservoir</footer></article>',
    )
  })

  test('children inside script use only the unnamed ones', async () => {
    class Inline extends Component {
      template() {
        return <script>{this.props.children}</script>
      }
    }
    expect(
      await renderToString(
        <Inline>
          <b slot="x">no</b>
          {'y = 1'}
        </Inline>,
      ),
    ).toBe('<script>y = 1</script>')
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

describe('render context', () => {
  // Tests don't declare RenderContext, so they read it loosely.
  type Loose = { lang?: string }

  class Flag extends Component {
    template({ lang }: Loose): Child {
      return <span>{lang}</span>
    }
  }
  class Card extends Component<{ children?: Child }> {
    template(): Child {
      return <div>{this.props.children}</div>
    }
  }
  class Page extends Component {
    template(): Child {
      return (
        <main>
          <Flag />
          <Card>
            <Flag />
          </Card>
        </main>
      )
    }
  }

  test('reaches every template, even through children and slots', async () => {
    const response = await render(<Page />, { context: { lang: 'es' } })
    expect(await response.text()).toBe(
      '<!doctype html><main><span>es</span><div><span>es</span></div></main>',
    )
  })

  test('is not sent as a response option', async () => {
    const response = await render(<Flag />, {
      status: 404,
      context: { lang: 'en' },
    })
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('<!doctype html><span>en</span>')
  })

  test('without one, optional fields read as undefined', async () => {
    expect(await renderToString(<Flag />)).toBe('<span></span>')
  })

  test('a test hands the context to template() itself', () => {
    const tree = new Flag({}).template({ lang: 'es' }) as Element
    expect(tree.props.children).toBe('es')
  })

  test('pages rendered at the same time keep their own context', async () => {
    const [es, en] = await Promise.all([
      render(<Page />, { context: { lang: 'es' } }),
      render(<Page />, { context: { lang: 'en' } }),
    ])
    expect(await es.text()).toBe(
      '<!doctype html><main><span>es</span><div><span>es</span></div></main>',
    )
    expect(await en.text()).toBe(
      '<!doctype html><main><span>en</span><div><span>en</span></div></main>',
    )
  })

  test('every template gets the object as given, methods included', async () => {
    class PageContext {
      constructor(readonly lang: string) {}
      greet() {
        return this.lang === 'es' ? 'hola' : 'hello'
      }
    }
    const given = new PageContext('es')
    const seen: unknown[] = []
    class Greeting extends Component {
      template(context: PageContext): Child {
        seen.push(context)
        return <b>{context.greet()}</b>
      }
    }
    const html = await renderToString(
      <>
        <Greeting />
        <Greeting />
      </>,
      given,
    )
    expect(html).toBe('<b>hola</b><b>hola</b>')
    expect(seen).toEqual([given, given])
    expect(seen[0]).toBe(given)
  })
})

describe('leaves, tags and scripts', () => {
  class Layout extends Component<{ children?: Child }> {
    template(): Child {
      return (
        <main>
          <Slot>fallback</Slot>
        </main>
      )
    }
  }

  test("'' renders nothing, so a slot still shows its fallback", async () => {
    expect(await renderToString(<Layout>{''}</Layout>)).toBe(
      '<main>fallback</main>',
    )
    expect(await renderToString(<img>{''}</img>)).toBe('<img>')
  })

  test('void and raw-text tags are known in any case', async () => {
    expect(await renderToString(<bR />)).toBe('<bR>')
    expect(await renderToString(<sCript>{'a<b'}</sCript>)).toBe(
      '<sCript>a<b</sCript>',
    )
  })

  test('a non-JS script is written as is, and refuses what would end it', async () => {
    const tpl = '<p>{{name}}</p>'
    expect(
      await renderToString(<script type="text/template">{tpl}</script>),
    ).toBe(`<script type="text/template">${tpl}</script>`)
    await expect(
      renderToString(<script type="text/template">{'</script>'}</script>),
    ).rejects.toThrow('in a <template> element')
  })

  test('a key hidden in a spread is refused too', () => {
    // The editor refuses it too; at runtime it fails as well.
    const attrs: object = { key: 'x', class: 'a' }
    expect(() => <div {...attrs} />).toThrow('`key` does nothing')
  })

  test('a Slot rendered on its own shows its fallback', async () => {
    expect(await renderToString(<Slot>alone</Slot>)).toBe('alone')
  })
})

describe('safety, foreign content and failures', () => {
  test('a script URL is refused like an event handler', async () => {
    await expect(
      renderToString(<a href=" javascript:alert(1)">x</a>),
    ).rejects.toThrow('holds a script URL')
    await expect(renderToString(<form action="VBScript:x" />)).rejects.toThrow(
      'script URL',
    )
    expect(await renderToString(<a href="/nes">x</a>)).toBe(
      '<a href="/nes">x</a>',
    )
  })

  test('an event handler with no value writes nothing and passes', async () => {
    expect(await renderToString(<button onclick={undefined}>ok</button>)).toBe(
      '<button>ok</button>',
    )
  })

  test('inside <svg>, <style> text is escaped like any text', async () => {
    const css = 'a{}<img src=x onerror=alert(1)>'
    expect(
      await renderToString(
        <svg>
          <style>{css}</style>
        </svg>,
      ),
    ).toBe('<svg><style>a{}&lt;img src=x onerror=alert(1)&gt;</style></svg>')
  })

  test('a script with no type, or a legacy JS type, is JavaScript', async () => {
    const off = false
    expect(
      await renderToString(
        <script type={off && 'module'}>{'"</script>"'}</script>,
      ),
    ).toBe('<script>"<\\/script>"</script>')
  })

  test('the first newline of <pre> survives the HTML parser', async () => {
    expect(await renderToString(<pre>{'\nline'}</pre>)).toBe(
      '<pre>\n\nline</pre>',
    )
  })

  test('a subclass of Slot keeps its name and its children', async () => {
    class FooterSlot extends Slot {
      static defaults = { name: 'footer' }
    }
    class Card extends Component<{ children?: Child }> {
      template(): Child {
        return (
          <div>
            <FooterSlot>fallback</FooterSlot>
          </div>
        )
      }
    }
    expect(
      await renderToString(
        <Card>
          <p slot="footer">F</p>
        </Card>,
      ),
    ).toBe('<div><p>F</p></div>')
  })

  test('a sibling failing at once still lets a slow failure be handled', async () => {
    class Slow extends Component {
      async template(): Promise<Child> {
        await new Promise((r) => setTimeout(r, 5))
        throw new Error('db down')
      }
    }
    const notChild = { not: 'a child' } as unknown as Child
    await expect(
      renderToString(
        <div>
          <Slow />
          {notChild}
        </div>,
      ),
    ).rejects.toThrow("can't render")
    await new Promise((r) => setTimeout(r, 20)) // Slow fails now; nothing unhandled
  })
})

// Type-level checks: each marked line must fail to compile for the stated
// reason. Never called; it only exists for `tsc`.
class Titled extends Component<{ title: string }> {
  template(): Child {
    return <h2>{this.props.title}</h2>
  }
}

const FnComponent = () => <p />

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
    // @ts-expect-error not on elements either
    <li key="1" />,
    // @ts-expect-error function components are not accepted
    <FnComponent />,
  ]
}

/** Type-level: children are opaque, whatever the props say. Never called. */
export class Shout extends Component<{ children: string }> {
  template(): Child {
    // @ts-expect-error children is a Child, not the string the props declared
    return <b>{this.props.children.toUpperCase()}</b>
  }
}

/** Type-level: union props keep working. Never called. */
export class Either extends Component<
  { kind: 'a'; a: string } | { kind: 'b'; b: number }
> {
  template(): Child {
    return this.props.kind === 'a' ? this.props.a : this.props.b
  }
}
export const eitherUse = () => <Either kind="a" a="hi" />
