/** `bytes` random bytes as hex: a token, a nonce. 16 bytes is 128 bits, enough for either. */
export function mint(bytes = 16): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** Bytes as lowercase hex, two digits each. */
export function hex(bytes: ArrayBuffer | Uint8Array): string {
  const all = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return [...all].map((b) => b.toString(16).padStart(2, '0')).join('')
}
