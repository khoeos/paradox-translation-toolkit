import { Card, CardContent } from '@ptt/ui/components/card'
import { cn } from '@ptt/ui/lib/utils'

interface KpiTileProps {
  label: string
  value: string
  sub?: string
  valueClassName?: string
}

export function KpiTile({ label, value, sub, valueClassName }: KpiTileProps) {
  return (
    <Card>
      <CardContent className="grid gap-1.5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn('text-3xl font-semibold tracking-tight', valueClassName)}>{value}</div>
        {sub !== undefined ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}
