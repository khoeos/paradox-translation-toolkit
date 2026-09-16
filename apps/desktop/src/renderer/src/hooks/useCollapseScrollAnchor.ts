import { useLayoutEffect, useRef } from 'react'

const WINDOW_SCROLLER = (): HTMLElement | null => null

export function useCollapseScrollAnchor(
  expanded: ReadonlySet<string>,
  getScroller: () => HTMLElement | null = WINDOW_SCROLLER
): (row: Element | null) => void {
  const pending = useRef<{ row: Element; top: number } | null>(null)

  const offsetOf = (row: Element): number => {
    const scroller = getScroller()
    const base = scroller === null ? 0 : scroller.getBoundingClientRect().top
    return row.getBoundingClientRect().top - base
  }

  useLayoutEffect(() => {
    const restore = pending.current
    if (restore === null) return
    pending.current = null
    const delta = offsetOf(restore.row) - restore.top
    if (delta === 0) return
    const scroller = getScroller()
    if (scroller === null) window.scrollBy(0, delta)
    else scroller.scrollTop += delta
  }, [expanded])

  return (row: Element | null): void => {
    pending.current = row === null ? null : { row, top: offsetOf(row) }
  }
}
