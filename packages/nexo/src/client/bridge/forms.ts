import type { Wanted } from './loader'
import { sameOrigin } from './origin'

/**
 * A form submission as data. Everything is read as attributes, never as
 * properties: a control named `action`, `method` or `target` shadows
 * those properties with itself, and the properties answer the page URL
 * when absent anyway. The submitter button may override the form's
 * method, action, encoding and target (`formmethod`, `formaction`,
 * `formenctype`, `formtarget`).
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
    opensElsewhere: opensElsewhere(form, submitter),
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

function opensElsewhere(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): boolean {
  const target =
    submitter?.getAttribute('formtarget') ?? form.getAttribute('target') ?? ''
  return target !== '' && target !== '_self'
}

/**
 * Whether a submission is one bridge can send, or one the browser must
 * keep: one already stopped, a `dialog` form (it closes its dialog,
 * nothing is sent), a form that opens elsewhere, or one going to another site.
 *
 * A form of this site whose answer redirects to ANOTHER site (a payment,
 * a sign-in handoff) is not bridge's either, but nothing here can tell:
 * `fetch` follows the redirect and fails there, before any response, and
 * a POST is never sent again. Mark such forms `data-bridge-target="_none"`
 * so the browser submits them. Decided 2026-10-20.
 */
export function isPlainSubmission(submission: Submission): boolean {
  if (submission.defaultPrevented || submission.method === 'DIALOG')
    return false
  if (submission.opensElsewhere) return false
  return sameOrigin(submission.action, submission.pageOrigin)
}

/** The request: GET puts the fields in the URL, like the browser; anything else sends them as the body, encoded as the form says, with a key of its own so a retry is answered once. */
export function wantedFrom(submission: Submission): Omit<Wanted, 'segments'> {
  const { method, fields, enctype } = submission
  const url = new URL(submission.action)
  if (method !== 'GET')
    return { url, method, body: bodyOf(fields, enctype), key: freshKey() }
  url.search = new URLSearchParams(fields as unknown as string[][]).toString()
  return { url, method }
}

/** 128 random bits as hex: `getRandomValues` works on plain HTTP too, unlike `randomUUID`. */
function freshKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const MULTIPART = 'multipart/form-data'

/** The fields the way the browser would send them: multipart as they are, else URL-encoded (fetch sets the content type for both). */
function bodyOf(fields: FormData, enctype: string): FormData | URLSearchParams {
  if (enctype === MULTIPART) return fields
  return new URLSearchParams(fields as unknown as string[][])
}

/** The methods HTML sends; the browser reads any other value as GET. */
const METHODS = new Set(['GET', 'POST', 'DIALOG'])

/** The method as the browser would send it: another value is reported, and goes as GET, as it would without JS. */
function methodOf(form: HTMLFormElement, submitter: HTMLElement | null) {
  const written =
    submitter?.getAttribute('formmethod') ||
    form.getAttribute('method') ||
    'get'
  const method = written.trim().toUpperCase()
  if (METHODS.has(method)) return method
  reportError(new Error(wrongMethod(written)))
  return 'GET'
}

function wrongMethod(written: string): string {
  return `bridge: method "${written}" is not one HTML sends (get, post, dialog); it goes as GET, as it would without JS`
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
