import { describe, expect, test } from 'bun:test'
import { isPlainSubmission, wantedFrom, type Submission } from './forms'

const fields = new FormData()
fields.set('q', 'ryu')

const search: Submission = {
  method: 'GET',
  action: 'http://museo.test/es/arcade',
  fields,
  pageOrigin: 'http://museo.test',
  opensElsewhere: false,
}

describe('isPlainSubmission', () => {
  test('a form to this site', () => {
    expect(isPlainSubmission(search)).toBe(true)
    expect(isPlainSubmission({ ...search, method: 'POST' })).toBe(true)
  })

  test('not a dialog form, one opening elsewhere or one to another site', () => {
    expect(isPlainSubmission({ ...search, method: 'DIALOG' })).toBe(false)
    expect(isPlainSubmission({ ...search, opensElsewhere: true })).toBe(false)
    expect(
      isPlainSubmission({ ...search, action: 'https://igdb.com/search' }),
    ).toBe(false)
  })
})

describe('wantedFrom', () => {
  test('GET puts the fields in the URL', () => {
    const wanted = wantedFrom(search)
    expect(wanted.url.href).toBe('http://museo.test/es/arcade?q=ryu')
    expect(wanted.body).toBeUndefined()
  })

  test('anything else sends them as the body', () => {
    const wanted = wantedFrom({ ...search, method: 'POST' })
    expect(wanted.url.href).toBe('http://museo.test/es/arcade')
    expect(wanted.body?.get('q')).toBe('ryu')
  })
})
