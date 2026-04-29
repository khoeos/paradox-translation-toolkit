import { FolderIcon } from 'lucide-react'

import { cn } from '@ptt/ui/lib/utils'

import { trpc } from '@renderer/lib/trpc'

interface FolderInputProps {
  value: string
  onChange: (path: string) => void
  placeholder?: string
  className?: string
}

export function FolderInput({ value, onChange, placeholder, className }: FolderInputProps) {
  const pickFolder = trpc.fs.pickFolder.useMutation()

  const handlePick = async (): Promise<void> => {
    const result = await pickFolder.mutateAsync(value ? { defaultPath: value } : undefined)
    if (result) onChange(result)
  }

  return (
    <div
      className={cn(
        'flex items-center h-10 w-full rounded-md border border-input bg-background overflow-hidden',
        className
      )}
    >
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="grow bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="button"
        onClick={handlePick}
        className="px-3 hover:bg-accent text-muted-foreground hover:text-foreground h-full transition-all duration-75"
        aria-label="Pick folder"
      >
        <FolderIcon className="w-5 h-5" />
      </button>
    </div>
  )
}
