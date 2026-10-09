/**
 * The words bridge puts in HTML, in one place so the server side (omino's
 * `<Segment>`), the client and the tests all spell them the same way.
 */

/** Every bridge attribute starts with this: `data-bridge-target`, `data-bridge-segment`… */
export const ATTRIBUTE_PREFIX = 'data-bridge-'

/** Marks a region of the page that can be replaced on its own: `data-bridge-segment="shelf"`. */
export const SEGMENT_ATTRIBUTE = `${ATTRIBUTE_PREFIX}segment`

/** The query parameter that asks the server for some segments only. */
export const SEGMENT_PARAM = '_segment'

/** The URL the client script is served at. */
export const CLIENT_PATH = '/_nexo/bridge.js'
