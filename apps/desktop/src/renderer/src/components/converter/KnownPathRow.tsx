import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@ptt/ui/lib/utils'

interface KnownPathRowProps {
  id: string
  fullPath: string
  title: string
  subtitle: string
  meta?: string
  pinned: boolean
  selected: boolean
  active: boolean
  onSelect: () => void
  onTogglePin: () => void
}

export function KnownPathRow({
  id,
  fullPath,
  title,
  subtitle,
  meta,
  pinned,
  selected,
  active,
  onSelect,
  onTogglePin
}: KnownPathRowProps) {
  const { t } = useTranslation()

  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      title={fullPath}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 cursor-pointer items-center gap-2.5 border-l-2 px-3 py-2 transition-colors duration-[120ms] ease-out',
        selected ? 'border-primary bg-primary/10' : 'border-transparent',
        !selected && active ? 'bg-muted' : '',
        !selected && !active ? 'hover:bg-muted/60' : ''
      )}
    >
      <button
        type="button"
        onClick={event => {
          event.stopPropagation()
          onTogglePin()
        }}
        aria-label={t(pinned ? 'folderPicker.unpin' : 'folderPicker.pin')}
        aria-pressed={pinned}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] ease-out outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <Star
          aria-hidden="true"
          className={cn('size-3.5', pinned ? 'fill-primary text-primary' : '')}
        />
      </button>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span
          className={cn(
            'truncate text-xs font-semibold',
            selected ? 'text-primary' : 'text-foreground'
          )}
        >
          {title}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
      {meta !== undefined ? (
        <span className="w-[74px] shrink-0 truncate text-right text-[11px] text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </div>
  )
}
