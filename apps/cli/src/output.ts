/**
 * Printing helpers: tables, colours and numbers that stay readable in a terminal.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/output.ts`) by Artem Kondrashev. Escape sequences are
 * written as code-point escapes rather than as literal control characters, which is what they
 * look like to a linter, a diff viewer and anything that pipes this file around.
 */

const ESC = '\u001b'
const RESET = `${ESC}[0m`

const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

const paint =
  (code: string) =>
  (text: string | number): string =>
    enabled ? `${ESC}[${code}m${text}${RESET}` : String(text)

export const bold = paint('1')
export const dim = paint('2')
export const red = paint('31')
export const green = paint('32')
export const yellow = paint('33')
export const cyan = paint('36')

/** Group thousands so a six-digit key count can be read at a glance. */
export function num(value: number): string {
  return value.toLocaleString('en-US').replaceAll(',', ' ')
}

/**
 * Shorten a value to fit a column, keeping the start, which is the part that identifies it.
 * @param text - The text
 * @param width - Maximum width
 * @returns The text, ellipsised when too long
 */
export function clip(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`
}

/** Colour codes take width in the string but none on screen. */
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

export function visibleLength(text: string): number {
  return text.replace(ANSI, '').length
}

function pad(text: string, width: number, right: boolean): string {
  const fill = ' '.repeat(Math.max(0, width - visibleLength(text)))
  return right ? `${fill}${text}` : `${text}${fill}`
}

export interface Column {
  header: string
  /** Numbers read better right aligned. */
  right?: boolean
  /** Cells longer than this are ellipsised. */
  max?: number
}

/**
 * Print a table, sizing every column to its content.
 * @param columns - The column definitions
 * @param rows - The rows, already formatted as strings
 */
export function table(columns: readonly Column[], rows: readonly string[][]): void {
  if (rows.length === 0) {
    console.log(dim('  (nothing to show)'))
    return
  }

  const cells = rows.map(row =>
    row.map((cell, index) => {
      const max = columns[index]?.max
      return max ? clip(cell, max) : cell
    })
  )

  const widths = columns.map((column, index) =>
    Math.max(visibleLength(column.header), ...cells.map(row => visibleLength(row[index] ?? '')))
  )

  const line = (row: readonly string[]): string =>
    row
      .map((cell, index) => pad(cell, widths[index] ?? 0, Boolean(columns[index]?.right)))
      .join('  ')

  console.log(`  ${bold(line(columns.map(column => column.header)))}`)
  console.log(`  ${dim(widths.map(width => '─'.repeat(width)).join('  '))}`)
  for (const row of cells) console.log(`  ${line(row)}`)
}

/** A titled block, so several sections of one command stay apart. */
export function section(title: string): void {
  console.log(`\n${bold(cyan(title))}`)
}

/** `label: value` lines, aligned on the colon. */
export function facts(entries: ReadonlyArray<readonly [string, string | number]>): void {
  if (entries.length === 0) return
  const width = Math.max(...entries.map(([label]) => label.length))
  for (const [label, value] of entries) {
    console.log(`  ${dim(`${label}:`.padEnd(width + 1))} ${value}`)
  }
}

/** How often the in-place line may repaint; more only makes the terminal flicker. */
const TICKER_INTERVAL_MS = 100
const CLEAR_LINE = `\r${ESC}[2K`

/** A single line rewritten in place, only when someone is watching. */
export function ticker(): (text: string) => void {
  if (!process.stderr.isTTY) return () => {}
  let last = 0
  return (text: string): void => {
    const now = Date.now()
    if (now - last < TICKER_INTERVAL_MS) return
    last = now
    process.stderr.write(`${CLEAR_LINE}${clip(text, (process.stderr.columns ?? 80) - 1)}`)
  }
}

/** Wipe whatever the ticker left on the line. */
export function clearTicker(): void {
  if (process.stderr.isTTY) process.stderr.write(CLEAR_LINE)
}
