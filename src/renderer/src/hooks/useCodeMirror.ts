import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { lang } from '@renderer/lib/langExtension'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const myHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#0080ff' },
  { tag: tags.punctuation, color: '#ff8b19' }
])

const langTheme = syntaxHighlighting(myHighlightStyle)

export default function useCodeMirror(extensions: any[]) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView>()

  useEffect(() => {
    if (!editorRef.current) return

    const view = new EditorView({
      extensions: [
        basicSetup,
        lang(),
        javascript({
          jsx: true,
          typescript: true
        }),
        langTheme,
        // EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            backgroundColor: '#2f333c',
            color: '#d4d4d4',
            height: '400px',
            fontSize: '14px',
            lineHeight: '1.5'
          },
          '.cm-gutters': {
            backgroundColor: '#1f1e23',
            color: '#8a919966',
            border: 'none'
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: '#fff'
          },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
            backgroundColor: '#153958'
          },
          '.cm-content': {
            padding: '10px 0'
          }
        }),
        ...extensions
      ],
      parent: editorRef.current
    })

    setView(view)

    return () => {
      view.destroy()
      setView(undefined)
    }
  }, [])

  return { ref: editorRef, view }
}
