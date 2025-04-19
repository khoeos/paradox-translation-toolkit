import { useCodeEditor } from '@renderer/hooks/useCodeEditor'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  extensions: any[]
}

export default function CodeEditor({ value, onChange, extensions }: CodeEditorProps) {
  const ref = useCodeEditor({ value, onChange, extensions })

  return <div ref={ref} style={{ height: '100%', width: '100%' }} />
}
