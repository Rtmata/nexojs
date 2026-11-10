/** The `terminal` piece: its own import path (A.1b), only what is public. */
export type {
  ArgsOf,
  CommandSpec,
  ErrorSpec,
  Fail,
  ResultOf,
  Table,
} from '../contract'
export { terminal } from '../terminal'
export type { Terminal } from '../terminal' // made by terminal() (audit item 12)
