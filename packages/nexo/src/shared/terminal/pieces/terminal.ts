/** The `terminal` piece: its own import path, only what is public. */
export type {
  ArgsOf,
  CommandSpec,
  ErrorSpec,
  Fail,
  ResultOf,
  Table,
} from '../contract'
export { terminal } from '../terminal'
export type { Terminal } from '../terminal' // made by terminal()
