/**
 * The words hedge puts on the wire, in one place so the server, the
 * site's forms and the tests spell them the same way.
 */

/** The cookie that holds the token, when the connection is secure (`__Host-`: no subdomain can plant it). */
export const SECURE_COOKIE = '__Host-hedge'

/** The same cookie over plain HTTP (a LAN address in development), where browsers refuse `__Host-`. */
export const PLAIN_COOKIE = 'hedge'

/** The form field a site puts the token in: `<input type="hidden" name="_hedge" value={ctx.hedge.token} />`. */
export const FIELD = '_hedge'

/** The header a `fetch` without a form puts the token in. */
export const HEADER = 'hedge'

/** Methods that change nothing, so nobody asks where they come from (RFC 9110 §9.2.1). */
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
