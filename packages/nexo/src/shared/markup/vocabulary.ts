/**
 * The words two modules share in HTML — one writes them, the other reads
 * them — in one neutral place, so neither imports the other (audit item 8).
 */

/** A region bridge can replace on its own; omino's `<Segment>` writes it: `data-bridge-segment="shelf"`. */
export const SEGMENT_ATTRIBUTE = 'data-bridge-segment'

/**
 * The marker omino writes on a component's `<style>` (C.20a). bridge moves
 * those a segment response brings into the head, once.
 */
export const COMPONENT_STYLE = 'data-scope-for'
