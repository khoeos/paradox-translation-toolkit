'use client'

import { TranslationItem } from '@global/types'
import { TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { cn } from '@renderer/lib/utils'
import { flexRender, Table } from '@tanstack/react-table'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  table: Table<TranslationItem>
}

const TranslationOverviewTableHeader = ({ table }: Props): JSX.Element => {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} className="hover:bg-transparent">
          {headerGroup.headers.map((header) => {
            return (
              <TableHead
                key={header.id}
                style={{ width: `${header.getSize()}px` }}
                className="h-11"
              >
                {header.isPlaceholder ? null : header.column.getCanSort() ? (
                  <div
                    className={cn(
                      header.column.getCanSort() &&
                        'flex h-full cursor-pointer select-none items-center justify-between gap-2',
                      header.column.columnDef.meta?.className
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                    onKeyDown={(e) => {
                      // Enhanced keyboard handling for sorting
                      if (header.column.getCanSort() && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        header.column.getToggleSortingHandler()?.(e)
                      }
                    }}
                    tabIndex={header.column.getCanSort() ? 0 : undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                      asc: (
                        <ChevronUp
                          className="shrink-0 opacity-60"
                          size={16}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      ),
                      desc: (
                        <ChevronDown
                          className="shrink-0 opacity-60"
                          size={16}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      )
                    }[header.column.getIsSorted() as string] ?? null}
                  </div>
                ) : (
                  flexRender(header.column.columnDef.header, header.getContext())
                )}
              </TableHead>
            )
          })}
        </TableRow>
      ))}
    </TableHeader>
  )
}

export default TranslationOverviewTableHeader
