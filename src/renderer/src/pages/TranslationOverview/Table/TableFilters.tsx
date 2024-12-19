'use client'

import { TranslationItem } from '@global/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@renderer/components/ui/alert-dialog'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Input } from '@renderer/components/ui/input'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { Table } from '@tanstack/react-table'
import { CircleAlert, CircleX, Columns3, ListFilter, Plus, Trash } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  table: Table<TranslationItem>
  id: string
  inputRef: React.RefObject<HTMLInputElement>
  // selectedStatuses: string[]
  // uniqueStatusValues: string[]
  // handleStatusChange: (checked: boolean, value: string) => void
  // statusCounts: Map<string, number>
  handleDeleteRows: () => void
  highlightBy: string
  setHighlightBy: (value: string) => void
}

const TableFilters = ({
  table,
  id,
  inputRef,
  // selectedStatuses,
  // uniqueStatusValues,
  // handleStatusChange,
  // statusCounts,
  handleDeleteRows,
  highlightBy,
  setHighlightBy
}: Props): JSX.Element => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {/* Filter by key */}
        <div className="relative">
          <Input
            id={`${id}-input`}
            ref={inputRef}
            className={cn(
              'peer min-w-60 ps-9',
              Boolean(table.getColumn('key_id')?.getFilterValue()) && 'pe-9'
            )}
            value={(table.getColumn('key_id')?.getFilterValue() ?? '') as string}
            onChange={(e) => table.getColumn('key_id')?.setFilterValue(e.target.value)}
            placeholder="Filter by key..."
            type="text"
            aria-label="Filter by key"
          />
          <div className="absolute inset-y-0 flex items-center justify-center pointer-events-none start-0 ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
            <ListFilter size={16} strokeWidth={2} aria-hidden="true" />
          </div>
          {Boolean(table.getColumn('key_id')?.getFilterValue()) && (
            <button
              className="absolute inset-y-0 flex items-center justify-center h-full transition-colors end-0 w-9 rounded-e-lg text-muted-foreground/80 outline-offset-2 hover:text-foreground focus:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Clear filter"
              onClick={() => {
                table.getColumn('key_id')?.setFilterValue('')
                if (inputRef.current) {
                  inputRef.current.focus()
                }
              }}
            >
              <CircleX size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
        {/* Filter by status */}
        {/* <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <Filter
                className="-ms-1 me-2 opacity-60"
                size={16}
                strokeWidth={2}
                aria-hidden="true"
              />
              Status
              {selectedStatuses.length > 0 && (
                <span className="-me-1 ms-3 inline-flex h-5 max-h-full items-center rounded border border-border bg-background px-1 font-[inherit] text-[0.625rem] font-medium text-muted-foreground/70">
                  {selectedStatuses.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-3 min-w-36" align="start">
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Filters</div>
              <div className="space-y-3">
                {uniqueStatusValues.map((value, i) => (
                  <div key={value} className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-${i}`}
                      checked={selectedStatuses.includes(value)}
                      onCheckedChange={(checked: boolean) => handleStatusChange(checked, value)}
                    />
                    <Label
                      htmlFor={`${id}-${i}`}
                      className="flex justify-between gap-2 font-normal grow"
                    >
                      {value}{' '}
                      <span className="text-xs ms-2 text-muted-foreground">
                        {statusCounts.get(value)}
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover> */}

        {/* Highlight by */}
        <Select onValueChange={(value) => setHighlightBy(value)} defaultValue={highlightBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Highlighted language" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="english">English</SelectItem>
              <SelectItem value="french">French</SelectItem>
              <SelectItem value="spanish">Spanish</SelectItem>
              <SelectItem value="german">German</SelectItem>
              <SelectItem value="polish">Polish</SelectItem>
              <SelectItem value="braz_por">Portuguese</SelectItem>
              <SelectItem value="russian">Russian</SelectItem>
              <SelectItem value="simp_chinese">Simplified Chinese</SelectItem>
              <SelectItem value="korean">Korean</SelectItem>
              <SelectItem value="japanese">Japanese</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Toggle columns visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Columns3
                className="-ms-1 me-2 opacity-60"
                size={16}
                strokeWidth={2}
                aria-hidden="true"
              />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-3">
        {/* Delete button */}
        {table.getSelectedRowModel().rows.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="ml-auto" variant="outline">
                <Trash
                  className="-ms-1 me-2 opacity-60"
                  size={16}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                Delete
                <span className="-me-1 ms-3 inline-flex h-5 max-h-full items-center rounded border border-border bg-background px-1 font-[inherit] text-[0.625rem] font-medium text-muted-foreground/70">
                  {table.getSelectedRowModel().rows.length}
                </span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <div className="flex flex-col gap-2 max-sm:items-center sm:flex-row sm:gap-4">
                <div
                  className="flex items-center justify-center border rounded-full size-9 shrink-0 border-border"
                  aria-hidden="true"
                >
                  <CircleAlert className="opacity-80" size={16} strokeWidth={2} />
                </div>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete{' '}
                    {table.getSelectedRowModel().rows.length} selected{' '}
                    {table.getSelectedRowModel().rows.length === 1 ? 'row' : 'rows'}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteRows}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {/* Add user button */}
        <Button className="ml-auto" variant="outline" disabled>
          <Plus className="-ms-1 me-2 opacity-60" size={16} strokeWidth={2} aria-hidden="true" />
          {t('addTradBtn')}
        </Button>
      </div>
    </div>
  )
}

export default TableFilters
