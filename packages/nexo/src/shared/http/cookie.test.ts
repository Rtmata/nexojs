import { expect, test } from 'bun:test'
import { cookieValue } from './cookie'

const asked = (cookie: string, name: string) =>
  cookieValue(new Request('http://x/', { headers: { cookie } }), name)

test('a cookie by name: unquoted and percent-decoded, the rest left alone', () => {
  expect(asked('a=1; lang="es"; b=2', 'lang')).toBe('es')
  expect(asked('lang=pt%2DBR', 'lang')).toBe('pt-BR')
  expect(asked('lang=%E0%A4%A', 'lang')).toBe('%E0%A4%A')
  expect(asked('t=a=b', 't')).toBe('a=b')
  expect(asked('other=1', 'lang')).toBeUndefined()
})
