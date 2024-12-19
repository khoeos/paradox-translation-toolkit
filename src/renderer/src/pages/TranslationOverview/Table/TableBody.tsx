import { TranslationItem } from '@global/types'
import { TableBody, TableCell, TableRow } from '@renderer/components/ui/table'
import { ColumnDef, flexRender, Table } from '@tanstack/react-table'

interface Props {
  table: Table<TranslationItem>
  columns: ColumnDef<TranslationItem>[]
  highlightBy: string
}

const TranslationOverviewTableBody = ({ table, columns, highlightBy }: Props): JSX.Element => {
  return (
    <TableBody>
      {table.getRowModel().rows?.length ? (
        table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={`last:py-0 ${highlightBy && highlightBy !== 'none' ? (row.getValue(highlightBy) ? 'bg-green-500/10' : 'bg-red-500/10') : ''}`}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))
      ) : (
        <TableRow>
          <TableCell colSpan={columns.length} className="h-24 text-center">
            No results.
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  )
}

export default TranslationOverviewTableBody
