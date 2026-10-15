import type { Wanted } from './loader'
import { sameOrigin } from './origin'

/**
 * A form submission as data. Everything is read as attributes, never as
 * properties: a control named `action`, `method` or `target` shadows
 * those properties with itself, and the properties answer the page URL
 * when absent anyway. The submitter button may override the form's
 * method and action (`formmethod`, `formaction`).
 */
export interface Submission {
  /** Upper case, as `Request` wants it. */
  method: string
  action: string
  fields: FormData
  pageOrigin: string
  opensElsewhere: boolean
}

export function submissionOf(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): Submission {
  const action =
    submitter?.getAttribute('formaction') ?? form.getAttribute('action') ?? ''
  const target = form.getAttribute('target') ?? ''
  return {
    method: methodOf(form, submitter),
    action: new URL(action, location.href).href,
    fields: new FormData(form, submitter),
    pageOrigin: location.origin,
    opensElsewhere: target !== '' && target !== '_self',
  }
}

/**
 * Whether a submission is one bridge can send, or one the browser must
 * keep: a `dialog` form (it closes its dialog, nothing is sent), a form
 * that opens elsewhere, or one going to another site.
 */
export function isPlainSubmission(submission: Submission): boolean {
  if (submission.method === 'DIALOG' || submission.opensElsewhere) return false
  return sameOrigin(submission.action, submission.pageOrigin)
}

/** The request: GET puts the fields in the URL, like the browser; anything else sends them as the body. */
export function wantedFrom(submission: Submission): Omit<Wanted, 'segments'> {
  const { method, fields } = submission
  const url = new URL(submission.action)
  if (method !== 'GET') return { url, method, body: fields }
  url.search = new URLSearchParams(fields as unknown as string[][]).toString()
  return { url, method }
}

function methodOf(form: HTMLFormElement, submitter: HTMLElement | null) {
  const method =
    submitter?.getAttribute('formmethod') ||
    form.getAttribute('method') ||
    'get'
  return method.toUpperCase()
}
