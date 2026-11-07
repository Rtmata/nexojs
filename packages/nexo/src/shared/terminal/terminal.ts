import { Client, type Transport } from './client'
import type { Table } from './contract'
import { CommandServer, type Handlers } from './server'

/**
 * A typed command table, shared by both sides (A.2, R.24): each command's
 * args, result, errors, and whether it only reads.
 *
 *   export const api = terminal({
 *     book: { args: object({ id: number() }), result: type<Book>(), errors: { notFound: { status: 404 } }, read: true },
 *   })
 *   const commands = api.client(http())                      // the browser
 *   keep({ router }).use(api.serve({ book: ({ id }, { fail }) => … }))   // the server
 */
export class Terminal<T extends Table> {
  constructor(readonly table: T) {}

  client(transport: Transport): Client<T> {
    return new Client(this.table, transport)
  }

  serve(
    handlers: Handlers<T>,
    options: { base?: string } = {},
  ): CommandServer<T> {
    return new CommandServer(this.table, handlers, options.base)
  }
}

export function terminal<const T extends Table>(table: T): Terminal<T> {
  return new Terminal(table)
}
