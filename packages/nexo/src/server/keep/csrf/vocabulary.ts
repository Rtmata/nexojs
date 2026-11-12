/**
 * The words keep's csrf check puts on the wire, in one place so the server, the
 * site's forms and the tests spell them the same way.
 */

/** The cookie that holds the token, when the connection is secure (`__Host-`: no subdomain can plant it). */
export const SECURE_COOKIE = '__Host-csrf'

/** The same cookie over plain HTTP (a LAN address in development), where browsers refuse `__Host-`. */
export const PLAIN_COOKIE = 'csrf'

/** The form field a site puts the token in: `<input type="hidden" name="_csrf" value={ctx.csrf.token} />`. */
export const FIELD = '_csrf'

/** The header a `fetch` without a form puts the token in. */
export const HEADER = 'x-csrf-token'
