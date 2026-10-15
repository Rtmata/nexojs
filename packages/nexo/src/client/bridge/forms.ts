import type { Wanted } from './loader'
import { sameOrigin } from './origin'

/**
 * A form submission as data. Everything is read as attributes, never as
 * properties: a control named `action`, `method` or `target` shadows
 * those properties with itself, and the properties answer the page URL
 * when absent anyway. The submitter button may override the form's
 * method, action and encoding (`formmethod`, `formaction`, `formenctype`).
 */
export interface Submission {
  /** Upper case, as `Request` wants it. */
  method: string
  action: string
  fields: FormData
  /** How the fields travel: `multipart/form-data`, or URL-encoded like the browser's default. */
  enctype: string
  pageOrigin: string
  opensElsewhere: boolean
  /** Something on the page already stopped the submit (a validation script): the browser won't send it, nor will bridge. */
  defaultPrevented: boolean
}

export function submissionOf(event: SubmitEvent): Submission {
  const form = event.target as HTMLFormElement
  const { submitter, defaultPrevented } = event
  const fields = new FormData(form, submitter)
  return {
    ...requestOf(form, submitter),
    fields,
    pageOrigin: location.origin,
    opensElsewhere: opensElsewhere(form),
    defaultPrevented,
  }
}

/** Method, action and encoding: the form's, unless the submitter overrides them. */
function requestOf(form: HTMLFormElement, submitter: HTMLElement | null) {
  return {
    method: methodOf(form, submitter),
    action: actionOf(form, submitter),
    enctype: enctypeOf(form, submitter),
  }
}

function opensElsewhere(form: HTMLFormElement): boolean {
  const target = form.getAttribute('target') ?? ''
  return target !== '' && target !== '_self'
}

/**
 * Whether a submission is one bridge can send, or one the browser must
 * keep: one already stopped, a `dialog` form (it closes its dialog,
 * nothing is sent), a form that opens elsewhere, or one going to another site.
 */
export function isPlainSubmission(submission: Submission): boolean {
  if (submission.defaultPrevented || submission.method === 'DIALOG')
    return false
  if (submission.opensElsewhere) return false
  return sameOrigin(submission.action, submission.pageOrigin)
}

/** The request: GET puts the fields in the URL, like the browser; anything else sends them as the body, encoded as the form says. */
export function wantedFrom(submission: Submission): Omit<Wanted, 'segments'> {
  const { method, fields, enctype } = submission
  const url = new URL(submission.action)
  if (method !== 'GET') return { url, method, body: bodyOf(fields, enctype) }
  url.search = new URLSearchParams(fields as unknown as string[][]).toString()
  return { url, method }
}

export const MULTIPART = 'multipart/form-data'

/** The fields the way the browser would send them: multipart as they are, else URL-encoded (fetch sets the content type for both). */
function bodyOf(fields: FormData, enctype: string): FormData | URLSearchParams {
  if (enctype === MULTIPART) return fields
  return new URLSearchParams(fields as unknown as string[][])
}

function methodOf(form: HTMLFormElement, submitter: HTMLElement | null) {
  const method =
    submitter?.getAttribute('formmethod') ||
    form.getAttribute('method') ||
    'get'
  return method.toUpperCase()
}

function actionOf(form: HTMLFormElement, submitter: HTMLElement | null) {
  const action =
    submitter?.getAttribute('formaction') ?? form.getAttribute('action') ?? ''
  return new URL(action, location.href).href
}

function enctypeOf(form: HTMLFormElement, submitter: HTMLElement | null) {
  const enctype =
    submitter?.getAttribute('formenctype') || form.getAttribute('enctype') || ''
  return enctype.trim().toLowerCase()
}
