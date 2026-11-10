/**
 * The `params` piece: the parsers of `data-<panel>-<key>` attributes, meant
 * for a namespace import, as Valibot recommends for its own (audit item 11):
 *
 *   import * as param from '@nexoamigos/nexo/panel/params'
 *   panel({ params: { start: param.number(0) }, … })
 */
export { boolean, json, number, oneOf, string } from '../params'
export type { Param, ParamsOf } from '../params'
