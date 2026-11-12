/** Methods that change nothing (RFC 9110 §9.2.1): nobody asks where they come from, and a retry needs no key. */
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
