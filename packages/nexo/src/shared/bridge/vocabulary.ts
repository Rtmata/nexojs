/**
 * The words bridge puts in HTML, in one place so the server side (omino's
 * `<Segment>`), the client and the tests all spell them the same way.
 */

/** Every bridge attribute starts with this: `data-bridge-target`, `data-bridge-segment`… */
export const ATTRIBUTE_PREFIX = 'data-bridge-'

/** `data-bridge-target` value for the whole page; also the name history gives whole-page entries. */
export const TOP = '_top'

/** `data-bridge-target` value that leaves links and forms below to the browser. */
export const NONE = '_none'

/** The query parameter that asks the server for some segments only. */
export const SEGMENT_PARAM = '_segment'

/** On `<html>` while a bridge runs, so a second start, from any script on the page, sees it; a whole-page swap keeps it. */
export const STARTED = `${ATTRIBUTE_PREFIX}started`

/** The URL the client script is served at. */
export const CLIENT_PATH = '/_nexo/bridge.js'
