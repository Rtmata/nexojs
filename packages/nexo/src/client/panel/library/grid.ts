import { panel } from '../panel'
import { number } from '../params'
import { Expansion, Leveled } from './expand'
import { emit } from './hold'
import { Marks } from './marks'

/**
 * Grid (WAI-ARIA APG Grid and Treegrid) on a native `<table>`:
 * layer 0 is the table, every row shown. The panel makes it one tab stop
 * and gives it APG's keys: arrows between cells (stopping at the edges:
 * a data grid never wraps), Home / End in the row, Ctrl+Home / End in the
 * grid, Page Up / Down by `page` rows (5). A cell with one simple widget
 * (a link, a button, a checkbox) focuses the widget; Enter or F2 enters a
 * cell with more, Escape leaves it. Rows with `aria-level` make it a
 * treegrid: parent rows (those followed by deeper rows) get
 * `aria-expanded`, ← and → close and open them (on the row) and their
 * children hide while closed; `grid:toggle` carries `{ id, expanded }`.
 *
 *   <table data-panel="grid" aria-label="Series">
 *     <thead><tr><th>Title</th><th>Year</th></tr></thead>
 *     <tbody>
 *       <tr aria-level="1" aria-expanded="true"><td>Ys</td><td>1987</td></tr>
 *       <tr aria-level="2"><td>Ys II</td><td>1988</td></tr>
 *     </tbody>
 *   </table>
 *
 * Not built (APG "if supported"): selection (`aria-selected`, Shift/Ctrl
 * keys), `aria-rowcount` for virtual rows, sorting.
 */
export const grid = panel({
  params: { page: number(5) },
  connect(el, { page }, { signal }) {
    if (!(el instanceof HTMLTableElement))
      throw new Error(
        `panel: grid: data-panel="grid" goes on a <table>, not <${el.localName}>`,
      )
    new Grid(el, page, signal)
  },
})

const WIDGET = 'a[href], button, input, select, textarea, summary, [tabindex]'

/** Widgets that take the arrow keys themselves: the cell stays the stop and Enter goes in. */
const TYPING =
  'input:not([type=button],[type=submit],[type=reset],[type=checkbox],[type=radio]), select, textarea, [contenteditable="true"]'

class Grid {
  private readonly marks = new Marks()
  private readonly rows: Expansion<HTMLTableRowElement>
  private readonly treegrid: boolean
  private editing?: HTMLTableCellElement

  constructor(
    private readonly table: HTMLTableElement,
    private readonly page: number,
    signal: AbortSignal,
  ) {
    this.treegrid = table.querySelector('tr[aria-level]') !== null
    this.rows = new Expansion(new Leveled(() => this.bodyRows()), this.marks)
    this.prepare()
    this.listen(signal)
    signal.addEventListener('abort', () => this.marks.restore(), { once: true })
  }

  private bodyRows(): HTMLTableRowElement[] {
    return [
      ...this.table.querySelectorAll<HTMLTableRowElement>(
        ':scope > tbody > tr, :scope > tr',
      ),
    ]
  }

  private allRows(): HTMLTableRowElement[] {
    return [...this.table.rows].filter((row) => !row.hidden)
  }

  private prepare(): void {
    this.marks.set(this.table, 'role', this.treegrid ? 'treegrid' : 'grid')
    for (const row of this.table.rows) this.prepareRow(row)
    this.settle(this.firstStop())
  }

  private prepareRow(row: HTMLTableRowElement): void {
    this.marks.set(row, 'role', 'row')
    if (this.treegrid && row.hasAttribute('aria-level'))
      this.marks.set(row, 'tabindex', '-1')
    for (const cell of row.cells) {
      this.marks.set(cell, 'role', cellRole(cell))
      this.marks.set(this.stopOf(cell), 'tabindex', '-1')
      for (const widget of widgetsOf(cell))
        this.marks.set(widget, 'tabindex', '-1')
    }
  }

  /** What takes focus for a cell: its one simple widget (a link, a button, a checkbox), else the cell. */
  private stopOf(cell: HTMLTableCellElement): HTMLElement {
    const widgets = widgetsOf(cell)
    const simple = widgets.length === 1 && !widgets[0]!.matches(TYPING)
    return simple ? widgets[0]! : cell
  }

  private stops(): HTMLElement[] {
    return this.allRows().flatMap((row) =>
      [...row.cells].map((c) => this.stopOf(c)),
    )
  }

  private firstStop(): HTMLElement | undefined {
    return this.stops()[0]
  }

  /** One tab stop (roving tabindex): `current`, be it a cell, its widget or a row. */
  private settle(current: HTMLElement | undefined): void {
    for (const stop of this.stops()) stop.tabIndex = stop === current ? 0 : -1
    for (const row of this.allRows())
      if (row.hasAttribute('tabindex')) row.tabIndex = row === current ? 0 : -1
  }

  private listen(signal: AbortSignal): void {
    const on = { signal }
    this.table.addEventListener('keydown', (e) => this.key(e), on)
    this.table.addEventListener('focusin', (e) => this.focused(e), on)
  }

  /** Focus landing outside the cell being edited ends the editing. */
  private focused(event: FocusEvent): void {
    const target = event.target as HTMLElement
    const stop = target.closest<HTMLElement>('td, th, tr')
    if (this.editing?.contains(target)) return
    this.edit(undefined)
    this.settle(this.stopFor(target) ?? stop ?? undefined)
  }

  /** Editing a cell: its widgets join the Tab order (APG: Tab moves among them); out, they leave it. */
  private edit(cell: HTMLTableCellElement | undefined): void {
    const was = this.editing
    this.editing = cell
    if (was) for (const w of widgetsOf(was)) this.marks.set(w, 'tabindex', '-1')
    if (cell)
      for (const w of widgetsOf(cell)) this.marks.set(w, 'tabindex', '0')
  }

  private stopFor(target: HTMLElement): HTMLElement | undefined {
    const cell = target.closest<HTMLTableCellElement>('td, th')
    if (cell && this.stopOf(cell) === target) return target
    if (cell) return this.stopOf(cell)
    return target instanceof HTMLTableRowElement ? target : undefined
  }

  private key(event: KeyboardEvent): void {
    if (this.editing) return this.editingKey(event)
    const handled = new GridKey(this, event).run()
    if (handled) event.preventDefault()
  }

  /** Inside a cell (Enter / F2): Tab moves among its widgets; Escape comes back. */
  private editingKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    const cell = this.editing!
    this.edit(undefined)
    this.go(cell)
  }

  // ---- what GridKey asks for

  /** The focused cell, or the row (treegrid row focus). */
  where():
    { row: HTMLTableRowElement; cell?: HTMLTableCellElement } | undefined {
    const active = document.activeElement as HTMLElement | null
    const row = active?.closest<HTMLTableRowElement>('tr')
    if (!row || !this.table.contains(row)) return undefined
    return {
      row,
      cell: active?.closest<HTMLTableCellElement>('td, th') ?? undefined,
    }
  }

  go(target: HTMLElement | undefined): boolean {
    if (!target) return false
    const stop =
      target instanceof HTMLTableCellElement ? this.stopOf(target) : target
    this.settle(stop)
    stop.focus()
    return true
  }

  /** The cell `dx` columns and `dy` visible rows away, stopping at the edges. */
  cellAt(
    from: HTMLTableCellElement,
    dx: number,
    dy: number,
  ): HTMLTableCellElement | undefined {
    const rows = this.allRows()
    const row =
      rows[
        clamp(
          rows.indexOf(from.parentElement as HTMLTableRowElement) + dy,
          rows.length,
        )
      ]
    return row?.cells[clamp(from.cellIndex + dx, row.cells.length)]
  }

  /** Moving by rows (treegrid row focus): among the rows that take focus. */
  rowAt(
    from: HTMLTableRowElement,
    dy: number,
  ): HTMLTableRowElement | undefined {
    const rows = this.focusableRows()
    return rows[clamp(rows.indexOf(from) + dy, rows.length)]
  }

  /** Home / End on a row, or Ctrl+Home / End in a cell: the first / last row. */
  edgeRow(
    last: boolean,
    amongFocusable = false,
  ): HTMLTableRowElement | undefined {
    const rows = amongFocusable ? this.focusableRows() : this.allRows()
    return last ? rows.at(-1) : rows[0]
  }

  private focusableRows(): HTMLTableRowElement[] {
    return this.allRows().filter((row) => this.rowFocusable(row))
  }

  get pageSize(): number {
    return this.page
  }

  isTreegrid(): boolean {
    return this.treegrid
  }

  /** ← / → on a parent row: closed or opened; says whether anything changed. */
  setOpen(row: HTMLTableRowElement, open: boolean): boolean {
    const changed = open ? this.rows.open(row) : this.rows.close(row)
    if (changed) emit(this.table, 'grid:toggle', { id: row.id, expanded: open })
    return changed
  }

  isParent(row: HTMLTableRowElement): boolean {
    return this.rows.isParent(row)
  }

  isOpen(row: HTMLTableRowElement): boolean {
    return this.rows.isOpen(row)
  }

  rowFocusable(row: HTMLTableRowElement): boolean {
    return row.hasAttribute('tabindex')
  }

  /** Enter / F2 on a cell whose widgets take keys (several, or a field): focus goes in; the grid's keys pause. */
  enter(cell: HTMLTableCellElement): boolean {
    const widgets = widgetsOf(cell)
    if (this.stopOf(cell) !== cell || widgets.length === 0) return false
    this.edit(cell)
    widgets[0]!.focus()
    return true
  }

  /** Focus is on a widget inside the cell, not the cell: Enter is the widget's. */
  onWidget(cell: HTMLTableCellElement): boolean {
    return document.activeElement !== cell
  }
}

function widgetsOf(cell: HTMLTableCellElement): HTMLElement[] {
  return [...cell.querySelectorAll<HTMLElement>(WIDGET)]
}

/** One key, APG Grid + Treegrid, resolved against where focus is. */
class GridKey {
  constructor(
    private readonly grid: Grid,
    private readonly event: KeyboardEvent,
  ) {}

  run(): boolean {
    const where = this.grid.where()
    if (!where || this.event.altKey || this.event.metaKey) return false
    return where.cell
      ? this.inCell(where.cell, where.row)
      : this.onRow(where.row)
  }

  private get ctrl(): boolean {
    return this.event.ctrlKey
  }

  private inCell(
    cell: HTMLTableCellElement,
    row: HTMLTableRowElement,
  ): boolean {
    const { key } = this.event
    const move = MOVES[key]
    if (move) return this.moveFrom(cell, move)
    if (key === 'Home' || key === 'End')
      return this.edgeFrom(cell, key === 'End')
    if (key === 'Enter' || key === 'F2') return this.enterOrToggle(cell, row)
    const by = this.pageBy()
    return by ? this.grid.go(this.grid.cellAt(cell, 0, by)) : false
  }

  /** Page Down / Up: `page` rows, as a signed count; 0 for any other key. */
  private pageBy(): number {
    const { key } = this.event
    if (key !== 'PageDown' && key !== 'PageUp') return 0
    return this.grid.pageSize * (key === 'PageDown' ? 1 : -1)
  }

  /** ← in a treegrid's first cell goes back to the row when rows take focus. */
  private moveFrom(
    cell: HTMLTableCellElement,
    [dx, dy]: [number, number],
  ): boolean {
    const row = cell.parentElement as HTMLTableRowElement
    if (dx < 0 && cell.cellIndex === 0 && this.grid.rowFocusable(row))
      return this.grid.go(row)
    return this.grid.go(this.grid.cellAt(cell, dx, dy))
  }

  /** Home / End in the row; with Ctrl, the first / last cell of the grid. */
  private edgeFrom(cell: HTMLTableCellElement, last: boolean): boolean {
    const row = this.ctrl
      ? this.grid.edgeRow(last)
      : (cell.parentElement as HTMLTableRowElement)
    const target = last ? row?.cells[row.cells.length - 1] : row?.cells[0]
    return this.grid.go(target)
  }

  /** Enter on a widget is the widget's own; on a cell it goes in, or toggles a parent row. */
  private enterOrToggle(
    cell: HTMLTableCellElement,
    row: HTMLTableRowElement,
  ): boolean {
    if (this.grid.onWidget(cell)) return false
    return this.grid.enter(cell) || this.toggleFromCell(cell, row)
  }

  /** Enter on a parent row's first cell toggles its children (cell-only focus, APG). */
  private toggleFromCell(
    cell: HTMLTableCellElement,
    row: HTMLTableRowElement,
  ): boolean {
    if (cell.cellIndex !== 0 || !this.grid.isParent(row)) return false
    return this.grid.setOpen(row, !this.grid.isOpen(row))
  }

  /** On a treegrid row: ← / → close and open (→ on an open or leaf row enters its first cell). */
  private onRow(row: HTMLTableRowElement): boolean {
    const { key } = this.event
    if (key === 'ArrowRight')
      return this.grid.setOpen(row, true) || this.grid.go(row.cells[0])
    if (key === 'ArrowLeft') return this.grid.setOpen(row, false)
    return this.alongRows(row)
  }

  private alongRows(row: HTMLTableRowElement): boolean {
    const { key } = this.event
    if (key === 'ArrowDown' || key === 'ArrowUp')
      return this.grid.go(this.grid.rowAt(row, key === 'ArrowDown' ? 1 : -1))
    if (key === 'Home' || key === 'End')
      return this.grid.go(this.grid.edgeRow(key === 'End', true))
    const by = this.pageBy()
    return by ? this.grid.go(this.grid.rowAt(row, by)) : false
  }
}

const MOVES: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
}

/** A header's role from where it sits: column headers in the head, row headers by scope. */
function cellRole(cell: HTMLTableCellElement): string {
  if (cell.localName !== 'th') return 'gridcell'
  if (cell.scope === 'row') return 'rowheader'
  return cell.closest('thead') || cell.scope === 'col'
    ? 'columnheader'
    : 'rowheader'
}

function clamp(at: number, length: number): number {
  return Math.min(length - 1, Math.max(0, at))
}
