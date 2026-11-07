/** What `notFound()` returns: "the route matched, the thing isn't there". */
export class NotFound {
  readonly notFound = true
}

/**
 * Return it from a loader when the route matched but what it names doesn't
 * exist (E.2 c), apart from "no route" (TanStack's two kinds). The server
 * answers with the router's `notFound` handler; the client router shows its.
 *
 *   load: async ({ params }) => (await find(params.id)) ?? notFound()
 */
export function notFound(): NotFound {
  return new NotFound()
}

export function isNotFound(value: unknown): value is NotFound {
  return value instanceof NotFound
}
