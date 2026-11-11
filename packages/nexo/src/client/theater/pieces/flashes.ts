/**
 * The `flashes` piece: flashes measured from a Playwright page's frames,
 * for tests. Not in theater's index: it runs beside the browser, not in it.
 */
export { flashes } from '../../../shared/theater/flashes-measured'
export type {
  FlashPage,
  FlashReport,
  MeasuredFlash,
} from '../../../shared/theater/flashes-measured'
