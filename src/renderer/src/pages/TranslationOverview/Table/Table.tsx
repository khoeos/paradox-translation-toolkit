import { Table } from '@renderer/components/ui/table'

import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  PaginationState,
  SortingState,
  VisibilityState,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'

import { JSX, useEffect, useId, useRef, useState } from 'react'
import TableFilters from '@renderer/pages/TranslationOverview/Table/TableFilters'
import TranslationOverviewTableHeader from '@renderer/pages/TranslationOverview/Table/TableHeader'
import TranslationOverviewTableBody from '@renderer/pages/TranslationOverview/Table/TableBody'
import TablePagination from '@renderer/pages/TranslationOverview/Table/TablePagination'
import TableRowActions from '@renderer/pages/TranslationOverview/Table/TableRowItems'
import { CircleCheck, CircleX } from 'lucide-react'
import { TranslationItem } from '@global/types'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@renderer/components/ui/hover-card'

// Custom filter function for multi-column searching
const multiColumnFilterFn: FilterFn<TranslationItem> = (row, columnId, filterValue) => {
  const searchableRowContent = `${row.original.key_id} ${row.original.fileName}`.toLowerCase()
  const searchTerm = (filterValue ?? '').toLowerCase()
  return searchableRowContent.includes(searchTerm)
}

const statusFilterFn: FilterFn<TranslationItem> = (row, columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true
  const status = row.getValue(columnId) as string
  return filterValue.includes(status)
}

const languages = {
  french: 'Français',
  german: 'Allemand',
  spanish: 'Espagnol',
  polish: 'Polonais',
  braz_por: 'Portugais',
  russian: 'Russe',
  simp_chinese: 'Chinois simplifié',
  korean: 'Coréen',
  japanese: 'Japonais'
}

const columns: ColumnDef<TranslationItem>[] = [
  // {
  //   id: 'select',
  //   header: ({ table }) => (
  //     <Checkbox
  //       checked={
  //         table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
  //       }
  //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
  //       aria-label="Select all"
  //     />
  //   ),
  //   cell: ({ row }) => (
  //     <Checkbox
  //       checked={row.getIsSelected()}
  //       onCheckedChange={(value) => row.toggleSelected(!!value)}
  //       aria-label="Select row"
  //     />
  //   ),
  //   size: 28,
  //   enableSorting: false,
  //   enableHiding: false
  // },
  {
    header: 'Clé',
    accessorKey: 'key_id',
    cell: ({ row }) => <div className="font-medium">{row.getValue('key_id')}</div>,
    size: 250,
    filterFn: multiColumnFilterFn,
    enableHiding: false
  },
  {
    header: 'Fichier',
    accessorKey: 'fileName'
  },
  {
    header: 'Anglais',
    accessorKey: 'english',
    size: 220,
    cell: ({ row }) => {
      const value = row.getValue<string[]>('english')
      return <div>{value && value.length > 0 ? value[0] : ''}</div>
    }
  },
  ...Object.keys(languages).map((language) => ({
    header: languages[language],
    accessorKey: language,
    cell: ({ row }) => {
      const value = row.getValue(language)
      return (
        <div className="flex justify-center">
          {value ? (
            <HoverCard openDelay={100} closeDelay={100}>
              <HoverCardTrigger className="flex items-center justify-center w-full">
                <CircleCheck size={16} className="text-green-500" />
              </HoverCardTrigger>
              <HoverCardContent>{value && value.length > 0 ? value[0] : ''}</HoverCardContent>
            </HoverCard>
          ) : (
            <CircleX size={16} className="text-red-500" />
          )}
        </div>
      )
    },
    size: 100,
    filterFn: statusFilterFn,
    meta: { className: 'text-center justify-center' }
  })),
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <TableRowActions row={row} />,
    size: 60,
    enableHiding: false
  }
]

export default function TranslationOverviewTable({
  sourceData
}: {
  sourceData: TranslationItem[]
}): JSX.Element {
  const id = useId()
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10
  })
  const inputRef = useRef<HTMLInputElement>(null!)

  const [highlightBy, setHighlightBy] = useState('none')

  const [sorting, setSorting] = useState<SortingState>([])

  const [data, setData] = useState<TranslationItem[]>(sourceData)
  useEffect(() => {
    setData(sourceData)
  }, [sourceData])

  const handleDeleteRows = (): void => {
    const selectedRows = table.getSelectedRowModel().rows
    const updatedData = data.filter(
      (item) => !selectedRows.some((row) => row.original.id === item.id)
    )
    setData(updatedData)
    table.resetRowSelection()
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    state: {
      sorting,
      pagination,
      columnFilters,
      columnVisibility
    }
  })

  // Get unique status values
  // const uniqueStatusValues = useMemo(() => {
  //   const statusColumn = table.getColumn('status')

  //   if (!statusColumn) return []

  //   const values = Array.from(statusColumn.getFacetedUniqueValues().keys())

  //   return values.sort()
  // }, [table.getColumn('status')?.getFacetedUniqueValues()])

  // Get counts for each status
  // const statusCounts = useMemo(() => {
  //   const statusColumn = table.getColumn('status')
  //   if (!statusColumn) return new Map()
  //   return statusColumn.getFacetedUniqueValues()
  // }, [table.getColumn('status')?.getFacetedUniqueValues()])

  // const selectedStatuses = useMemo(() => {
  //   const filterValue = table.getColumn('status')?.getFilterValue() as string[]
  //   return filterValue ?? []
  // }, [table.getColumn('status')?.getFilterValue()])

  // const handleStatusChange = (checked: boolean, value: string) => {
  //   const filterValue = table.getColumn('status')?.getFilterValue() as string[]
  //   const newFilterValue = filterValue ? [...filterValue] : []

  //   if (checked) {
  //     newFilterValue.push(value)
  //   } else {
  //     const index = newFilterValue.indexOf(value)
  //     if (index > -1) {
  //       newFilterValue.splice(index, 1)
  //     }
  //   }

  //   table.getColumn('status')?.setFilterValue(newFilterValue.length ? newFilterValue : undefined)
  // }

  return (
    <div className="space-y-4 ">
      {/* Filters */}
      <TableFilters
        table={table}
        id={id}
        inputRef={inputRef}
        // selectedStatuses={selectedStatuses}
        // uniqueStatusValues={uniqueStatusValues}
        // handleStatusChange={handleStatusChange}
        // statusCounts={statusCounts}
        handleDeleteRows={handleDeleteRows}
        highlightBy={highlightBy}
        setHighlightBy={setHighlightBy}
      />

      {/* Table */}
      <div className="overflow-hidden border rounded-lg border-border bg-background">
        <Table className="table-fixed">
          <TranslationOverviewTableHeader table={table} />
          <TranslationOverviewTableBody table={table} columns={columns} highlightBy={highlightBy} />
        </Table>
      </div>

      {/* Pagination */}
      <TablePagination table={table} id={id} />
    </div>
  )
}
