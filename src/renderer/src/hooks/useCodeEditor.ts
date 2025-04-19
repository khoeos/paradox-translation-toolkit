import { onUpdate } from '@renderer/hooks/onUpdate'
import useCodeMirror from '@renderer/hooks/useCodeMirror'
import { useEffect } from 'react'

export function useCodeEditor({ value, onChange, extensions }) {
  const { ref, view } = useCodeMirror([onUpdate(onChange), ...extensions])

  useEffect(() => {
    if (view) {
      const editorValue = view.state.doc.toString()

      if (value !== editorValue) {
        view.dispatch({
          changes: {
            from: 0,
            to: editorValue.length,
            insert: value || ''
          }
        })
      }
    }
  }, [value, view])

  return ref
}
