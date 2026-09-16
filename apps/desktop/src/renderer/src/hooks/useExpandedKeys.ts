import { useState } from 'react'

export interface ExpandedKeys {
  expanded: ReadonlySet<string>
  toggle: (key: string) => void
}

export function useExpandedKeys(): ExpandedKeys {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const toggle = (key: string): void => {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return { expanded, toggle }
}
