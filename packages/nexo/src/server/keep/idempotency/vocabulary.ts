/** The header a client puts a key in, one per attempt (IETF draft "The Idempotency-Key HTTP Header Field"). */
export const KEY_HEADER = 'idempotency-key'

/** Set on a response that is the recorded one played again. */
export const REPLAYED_HEADER = 'idempotent-replayed'

/** A response bigger than this is not recorded: a form's answer is a redirect or a short page. */
export const BODY_CAP = 1_000_000
