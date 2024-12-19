/* eslint-disable @typescript-eslint/no-unused-vars */
import { ColumnMeta } from '@tanstack/react-table'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends object> {
    className?: string
  }
}
