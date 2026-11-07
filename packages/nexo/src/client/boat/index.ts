/**
 * boat in the browser (E.1, E.2): the client router. It takes `match` as a
 * plain function and the URL source the app picks; reactivity arrives as a
 * value (R.20). It imports neither omino nor connector.
 */
export { notFound } from '../../shared/boat/not-found'
export { boat, ClientRouter } from './router'
export type { BoatClientOptions } from './router'
export type { Reactivity } from './reactivity'
export { routes } from './routes'
export type {
  ClientMatch,
  ClientRoute,
  LoadContext,
  PageContext,
} from './routes'
export { hashUrl, historyUrl, memoryUrl, navigationUrl } from './sources'
export type { Arrival, SourceListener, UrlSource } from './sources'
