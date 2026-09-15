import type { ReactNode } from 'react'

interface KnownPathGroupProps {
  titleId: string
  label: string
  count: number
  visible: boolean
  isEmpty: boolean
  status?: ReactNode
  emptyMessage?: ReactNode
  children: ReactNode
}

export function KnownPathGroup({
  titleId,
  label,
  count,
  visible,
  isEmpty,
  status,
  emptyMessage,
  children
}: KnownPathGroupProps) {
  if (!visible) return null

  return (
    <div role="group" aria-labelledby={titleId}>
      <div
        id={titleId}
        className="sticky top-0 z-[2] flex items-center gap-2 border-b bg-muted px-3 py-1.5 shadow-[0_6px_10px_-8px_rgb(0_0_0_/_0.9)]"
      >
        <span className="text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
          {label}
        </span>
        {status === undefined ? (
          <span className="font-mono text-[10.5px] text-muted-foreground/70">{count}</span>
        ) : null}
      </div>
      {status ?? (isEmpty ? emptyMessage : children)}
    </div>
  )
}
