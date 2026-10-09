import type { Wanted } from './loader'

/**
 * A form submission as a request: the submitter button may override the
 * form's method and action (`formmethod`, `formaction`, read as attributes:
 * the properties answer the page URL when absent). GET puts the fields in
 * the URL, like the browser; anything else sends them as the body.
 */
export function wantedFrom(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): Omit<Wanted, 'segments'> {
  const method = methodOf(form, submitter)
  const action = submitter?.getAttribute('formaction')
  const url = new URL(action ?? form.action, location.href)
  const data = new FormData(form, submitter)
  if (method !== 'GET') return { url, method, body: data }
  url.search = new URLSearchParams(data as unknown as string[][]).toString()
  return { url, method }
}

function methodOf(form: HTMLFormElement, submitter: HTMLElement | null) {
  const method = submitter?.getAttribute('formmethod') || form.method || 'get'
  return method.toUpperCase()
}
