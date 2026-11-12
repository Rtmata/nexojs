/**
 * The script bridge serves at /_nexo/bridge.js: bridge, started for the
 * page's whole life. It also exports bridge's API, so a page whose import
 * map sends `@nexoamigos/nexo/bridge/client` here (`visit`, `arrivals`)
 * uses this same bridge. A page whose own bundled entry calls `start`
 * leaves this script out.
 */
import { start } from './bridge'

export * from './bridge'

start({ signal: new AbortController().signal }) // the page's life: nothing else ends it
