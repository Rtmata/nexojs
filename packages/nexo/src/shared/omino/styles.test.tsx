import { describe, expect, test } from 'bun:test'
import { Component, css, render, type Child } from './index'
import { renderToString } from './render'

class Card extends Component {
  static styles = [
    css`
      :scope {
        padding: ${1}rem;
      }
      p {
        color: red;
      }
    `,
  ]
  template(): Child {
    return (
      <section>
        <p>{this.props.children}</p>
      </section>
    )
  }
}

class Loud extends Component {
  static styles = ['b { color: red }']
  static encapsulation = 'none' as const
  template(): Child {
    return <b>!</b>
  }
}

class Boxed extends Component {
  static styles = ['p { color: blue }']
  static encapsulation = 'shadow' as const
  template(): Child {
    return (
      <x-box>
        <p>inside</p>
      </x-box>
    )
  }
}

const page = (body: Child) => (
  <html>
    <head>
      <title>t</title>
    </head>
    <body>{body}</body>
  </html>
)

describe('component styles on the server', () => {
  test('the root is marked; the CSS goes once into head, inside @scope', async () => {
    const html = await (
      await render(page([<Card>a</Card>, <Card>b</Card>]))
    ).text()
    expect(html).toContain('<section data-scope="Card"><p>a</p></section>')
    expect(html.match(/data-scope-for="Card"/g)).toHaveLength(1)
    const sheet = html.slice(html.indexOf('<style'), html.indexOf('</head>'))
    expect(sheet).toStartWith(
      '<style data-scope-for="Card">@scope ([data-scope="Card"]) to ([data-scope]) {',
    )
    expect(sheet).toContain('padding: 1rem')
    expect(sheet).toEndWith('}</style>')
  })

  test('without a head (a fragment, a segment) the styles go in front', async () => {
    const html = await renderToString(<Card>a</Card>)
    expect(html.startsWith('<style data-scope-for="Card">')).toBe(true)
  })

  test("encapsulation 'none': global, unmarked", async () => {
    const html = await renderToString(page(<Loud />))
    expect(html).toContain('<b>!</b>')
    expect(html).toContain(
      '<style data-scope-for="Loud">b { color: red }</style>',
    )
  })

  test("encapsulation 'shadow': a declarative shadow root with its styles, nothing in head", async () => {
    const html = await renderToString(page(<Boxed />))
    expect(html).toContain(
      '<x-box><template shadowrootmode="open"><style>p { color: blue }</style><p>inside</p></template></x-box>',
    )
    expect(html).not.toContain('data-scope-for')
  })

  test('two classes with one name and different styles are an error', async () => {
    const Other = class Card extends Component {
      static styles = ['p { color: green }']
      template(): Child {
        return <p />
      }
    }
    await expect(renderToString(page([<Card />, <Other />]))).rejects.toThrow(
      'two components named Card',
    )
  })

  test('a page-wide sheet goes once, before the components', async () => {
    const sheet = {
      name: 'glyph.recipes(button)',
      css: '.button { color: red }',
    }
    class Buy extends Component {
      static styles = [sheet, 'p { margin: 0 }']
      template(): Child {
        return <p />
      }
    }
    class Plain extends Component {
      static styles = [sheet]
      template(): Child {
        return <b />
      }
    }
    const html = await renderToString(page([<Buy />, <Plain />, <Buy />]))
    expect(html.match(/data-sheet=/g)).toHaveLength(1)
    expect(html).toContain(
      '<style data-sheet="glyph.recipes(button)">.button { color: red }</style><style data-scope-for="Buy">',
    )
    expect(html).toContain('<b></b>') // only sheets: nothing to scope, no mark
  })

  test('sheets: one name with two CSS, a non-list, a wrong item, a shadow component', async () => {
    const one = (css: string) =>
      class extends Component {
        static styles = [{ name: 'same', css }]
        template(): Child {
          return <p />
        }
      }
    const [A, B] = [one('a {}'), one('b {}')]
    await expect(renderToString(page([<A />, <B />]))).rejects.toThrow(
      'two sheets named "same" have different CSS',
    )
    class Single extends Component {
      static styles = 'p {}' as never
      template(): Child {
        return <p />
      }
    }
    await expect(renderToString(<Single />)).rejects.toThrow(
      'Single.styles is a list',
    )
    class Wrong extends Component {
      static styles = [{ name: 'x' }] as never
      template(): Child {
        return <p />
      }
    }
    await expect(renderToString(<Wrong />)).rejects.toThrow(
      'each item is CSS text or a sheet with a name and its css',
    )
    class Shadowy extends Component {
      static styles = [{ name: 'x', css: '' }]
      static encapsulation = 'shadow' as const
      template(): Child {
        return <x-y />
      }
    }
    await expect(renderToString(<Shadowy />)).rejects.toThrow(
      "Shadowy lists page-wide sheets but has encapsulation 'shadow'",
    )
  })

  test('a </style> inside the CSS is an error', async () => {
    class Bad extends Component {
      static styles = ['p {} </style><script>']
      template(): Child {
        return <p />
      }
    }
    await expect(renderToString(<Bad />)).rejects.toThrow('</style')
  })
})
