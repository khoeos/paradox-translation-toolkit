import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

import { formatPath } from '@renderer/lib/format-path'

interface VirtualizedFileListProps {
  files: string[]
  onPick: (dir: string) => void
}

const ROW_HEIGHT = 24
const VISIBLE_HEIGHT = 200

/** Virtualised file list used in ProgressModal to bound DOM size. */
export function VirtualizedFileList({ files, onPick }: VirtualizedFileListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8
  })

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{ height: Math.min(VISIBLE_HEIGHT, files.length * ROW_HEIGHT) }}
    >
      <ul
        className="relative font-mono text-xs"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map(virtualRow => {
          const file = files[virtualRow.index]
          if (!file) return null
          const dir = file.split('/').slice(0, -1).join('/')
          return (
            <li
              key={file}
              className="absolute left-0 right-0"
              style={{
                top: `${virtualRow.start}px`,
                height: `${virtualRow.size}px`
              }}
            >
              <button
                type="button"
                onClick={() => onPick(dir)}
                className="hover:underline truncate text-left w-full block"
                title={file}
              >
                {formatPath(file)}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
