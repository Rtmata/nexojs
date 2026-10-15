import { describe, expect, test } from 'bun:test'
import {
  isPlainSubmission,
  MULTIPART,
  wantedFrom,
  type Submission,
} from './forms'

const fields = new FormData()
fields.set('q', 'ryu')

const search: Submission = {
  method: 'GET',
  action: 'http://museo.test/es/arcade',
  fields,
  enctype: '',
  pageOrigin: 'http://museo.test',
  opensElsewhere: false,
  defaultPrevented: false,
}

describe('isPlainSubmission', () => {
  test('a form to this site', () => {
    expect(isPlainSubmission(search)).toBe(true)
    expect(isPlainSubmission({ ...search, method: 'POST' })).toBe(true)
  })

  test('not one already stopped, a dialog form, one opening elsewhere or one to another site', () => {
    expect(isPlainSubmission({ ...search, defaultPrevented: true })).toBe(false)
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

  test('anything else sends them as the body, URL-encoded by default', () => {
    const wanted = wantedFrom({ ...search, method: 'POST' })
    expect(wanted.url.href).toBe('http://museo.test/es/arcade')
    expect(wanted.body).toBeInstanceOf(URLSearchParams)
    expect(wanted.body?.toString()).toBe('q=ryu')
  })

  test('multipart sends the fields as they are', () => {
    const wanted = wantedFrom({ ...search, method: 'POST', enctype: MULTIPART })
    expect(wanted.body).toBeInstanceOf(FormData)
    expect((wanted.body as FormData).get('q')).toBe('ryu')
  })
})
