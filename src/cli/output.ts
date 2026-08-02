/** Printing helpers: tables, colours and numbers that stay readable in a terminal */

const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

const paint =
  (code: string) =>
  (text: string | number): string =>
    enabled ? `\x1b[${code}m${text}\x1b[0m` : String(text)

export const bold = paint('1')
export const dim = paint('2')
export const red = paint('31')
export const green = paint('32')
export const yellow = paint('33')
export const cyan = paint('36')

/** Group thousands so a six digit key count can be read at a glance */
export const num = (value: number): string => value.toLocaleString('en-US').replace(/,/g, ' ')

/**
 * Shorten a value to fit a column, keeping the start which is the part that identifies it
 * @param text - The text
 * @param width - Maximum width
 * @returns The text, ellipsised when too long
 */
export const clip = (text: string, width: number): string =>
  text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`

/**
 * Colour codes take width in the string but none on screen. Built from a code point rather
 * than written as a literal escape, which is what a control character in a regex looks like
 * to a linter that cannot tell a terminal sequence from a mistake.
 */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

const visibleLength = (text: string): number => text.replace(ANSI, '').length

const pad = (text: string, width: number, right: boolean): string => {
  const fill = ' '.repeat(Math.max(0, width - visibleLength(text)))
  return right ? `${fill}${text}` : `${text}${fill}`
}

export interface Column {
  header: string
  /** Numbers read better right aligned */
  right?: boolean
  /** Cells longer than this are ellipsised */
  max?: number
}

/**
 * Print a table, sizing every column to its content
 * @param columns - The column definitions
 * @param rows - The rows, already formatted as strings
 */
export const table = (columns: Column[], rows: string[][]): void => {
  if (rows.length === 0) {
    console.log(dim('  (nothing to show)'))
    return
  }

  const cells = rows.map((row) =>
    row.map((cell, index) => {
      const max = columns[index]?.max
      return max ? clip(cell, max) : cell
    })
  )

  const widths = columns.map((column, index) =>
    Math.max(visibleLength(column.header), ...cells.map((row) => visibleLength(row[index] ?? '')))
  )

  const line = (row: string[]): string =>
    row.map((cell, index) => pad(cell, widths[index], Boolean(columns[index]?.right))).join('  ')

  console.log(`  ${bold(line(columns.map((column) => column.header)))}`)
  console.log(`  ${dim(widths.map((width) => '─'.repeat(width)).join('  '))}`)
  for (const row of cells) console.log(`  ${line(row)}`)
}

/** A titled block, so several sections of one command stay apart */
export const section = (title: string): void => console.log(`\n${bold(cyan(title))}`)

/** `label: value` lines, aligned on the colon */
export const facts = (entries: [string, string | number][]): void => {
  const width = Math.max(...entries.map(([label]) => label.length))
  for (const [label, value] of entries) {
    console.log(`  ${dim(`${label}:`.padEnd(width + 1))} ${value}`)
  }
}

/** A single line rewritten in place, only when someone is watching */
export const ticker = (): ((text: string) => void) => {
  if (!process.stderr.isTTY) return () => {}
  let last = 0
  return (text: string): void => {
    // Repainting on every mod of a 200 mod collection only makes the terminal flicker
    const now = Date.now()
    if (now - last < 100) return
    last = now
    process.stderr.write(`\r\x1b[2K${clip(text, (process.stderr.columns ?? 80) - 1)}`)
  }
}

/** Wipe whatever the ticker left on the line */
export const clearTicker = (): void => {
  if (process.stderr.isTTY) process.stderr.write('\r\x1b[2K')
}
