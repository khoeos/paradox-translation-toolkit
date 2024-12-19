import * as React from 'react'

import { cn } from '@renderer/lib/utils'
import { FolderIcon } from 'lucide-react'
import { IpcKey } from '@global/types'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'input'

const FolderInput = React.forwardRef<HTMLInputElement, InputProps & { ipc: IpcKey }>(
  ({ className, ipc, type, ...props }, ref) => {
    const ipcOpenFolder = (): void => window.electron.ipcRenderer.send(ipc)

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center h-10 w-full rounded-md border border-input bg-background overflow-hidden',
          className
        )}
      >
        <input
          type={type}
          className={cn(
            'grow bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
          )}
          {...props}
        />
        <FolderIcon
          className="flex-shrink-0 w-6 h-6 mr-2 text-gray-300 cursor-pointer"
          onClick={ipcOpenFolder}
        />
      </div>
    )
  }
)
FolderInput.displayName = 'Folderinput'

export { Input, FolderInput }
