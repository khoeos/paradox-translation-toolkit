import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, syntaxHighlighting, StreamLanguage } from '@codemirror/language'

const paradoxHighlighting = HighlightStyle.define([
  { tag: t.comment, color: '#6A9955' },
  { tag: t.string, color: '#CE9178' },
  { tag: t.variableName, color: '#9CDCFE' },
  { tag: t.propertyName, color: '#569CD6' },
  { tag: t.operator, color: '#D4D4D4' },
  { tag: t.className, color: '#4EC9B0' },
  { tag: t.meta, color: '#D16969' },
  { tag: t.definition, color: '#C586C0' }
])

const paradoxLang = StreamLanguage.define({
  name: 'paradox',
  startState: () => ({ inString: false }),
  token: (stream, state) => {
    // Handle comments
    if (stream.match('#')) {
      stream.skipToEnd()
      return 'comment'
    }

    // Handle whitespace
    if (stream.eatSpace()) return null

    // Handle language declaration
    if (stream.match(/l_\w+:/)) return 'propertyName'

    // Handle special markers
    if (stream.match(/§[LHPBGRY]/)) return 'meta'
    if (stream.match(/\['[^']+'\]/)) return 'definition'
    if (stream.match(/\$[^$]+\$/)) return 'className'

    // Handle key-value separator
    if (stream.match(':')) return 'operator'

    // Handle quoted strings
    if (stream.match('"')) {
      state.inString = !state.inString
      return 'string'
    }
    if (state.inString) {
      stream.next()
      return 'string'
    }

    // Handle keys
    if (stream.match(/[^:"]+(?=:)/)) return 'variableName'

    stream.next()
    return null
  }
})

export default function useCodeMirror(extensions: any[]) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView>()

  useEffect(() => {
    if (!editorRef.current) return

    const view = new EditorView({
      extensions: [
        basicSetup,
        // javascript({
        //   jsx: true,
        //   typescript: true
        // }),
        paradoxLang,
        syntaxHighlighting(paradoxHighlighting),
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
