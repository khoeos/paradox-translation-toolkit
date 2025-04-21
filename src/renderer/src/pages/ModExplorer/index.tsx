import { IpcKey } from '@global/types'
import { FolderInput } from '@renderer/components/ui/input'
import TranslationOverview from '@renderer/pages/TranslationOverview'
import { useEffect, useState } from 'react'

export default function ModExporer(): JSX.Element {
  const [path, setPath] = useState<string>('')

  useEffect(() => {
    window.api.on(IpcKey.SELECT_FOLDER_RESULT, (result) => setPath(result as string))
  }, [])

  return (
    <div className="p-8 max-w-screen">
      <FolderInput
        ipc={IpcKey.SELECT_FOLDER_EXPLORER}
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder={'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\281990'}
        className={path === '' ? 'border border-red-500/60' : ''}
      />
      <TranslationOverview />
    </div>
  )
}
