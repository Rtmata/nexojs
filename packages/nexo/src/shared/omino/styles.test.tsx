import { describe, expect, test } from 'bun:test'
import { Component, css, render, type Child } from './index'
import { renderToString } from './render'

class Card extends Component {
  static styles = css`
    :scope {
      padding: ${1}rem;
    }
    p {
      color: red;
    }
  `
  template(): Child {
    return (
      <section>
        <p>{this.props.children}</p>
      </section>
    )
  }
}

class Loud extends Component {
  static styles = 'b { color: red }'
  static encapsulation = 'none' as const
  template(): Child {
    return <b>!</b>
  }
}

class Boxed extends Component {
  static styles = 'p { color: blue }'
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
      static styles = 'p { color: green }'
      template(): Child {
        return <p />
      }
    }
    await expect(renderToString(page([<Card />, <Other />]))).rejects.toThrow(
      'two components named Card',
    )
  })

  test('a </style> inside the CSS is an error', async () => {
    class Bad extends Component {
      static styles = 'p {} </style><script>'
      template(): Child {
        return <p />
      }
    }
    await expect(renderToString(<Bad />)).rejects.toThrow('</style')
  })
})
