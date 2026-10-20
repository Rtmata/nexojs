/** `bytes` random bytes as hex: a token, a nonce. 16 bytes is 128 bits, enough for either. */
export function mint(bytes = 16): string {
  const random = crypto.getRandomValues(new Uint8Array(bytes))
  return [...random].map((b) => b.toString(16).padStart(2, '0')).join('')
}
