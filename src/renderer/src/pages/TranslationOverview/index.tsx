/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from '@renderer/components/ui/button'

import TranslationOverviewTable from '@renderer/pages/TranslationOverview/Table/Table'
import { useEffect, useState } from 'react'

export default function TranslationOverview(): JSX.Element {
  const [results, setResults] = useState<any>([])
  const [data, setData] = useState<any>([])

  const handleClick = (): void => {
    window.electron.ipcRenderer.send('parseFile')
  }

  useEffect(() => {
    window.api.on('parseFileResult', (result: any) => {
      setResults(
        Object.entries(result.keys).map(([key, translations]: [string, any]) => ({
          key_id: key,
          ...translations
        }))
      )
      setData(result.data)
    })
  }, [])

  return (
    <div className="p-8">
      <Button onClick={handleClick}>Click me</Button>

      <div>
        {data && (
          <div className="my-4">
            <ul className="grid grid-cols-5">
              {Object.keys(data).map((key) => (
                <li key={key} className={key === 'total' ? 'col-span-5 font-semibold' : ''}>
                  <span className="capitalize">{key}</span> :{' '}
                  <code
                    className={
                      data[key] === data.total
                        ? key === 'total'
                          ? ''
                          : 'text-green-500'
                        : data[key] > data.total / 2
                          ? 'text-yellow-500'
                          : 'text-red-500'
                    }
                  >
                    {data[key]}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>{results && <TranslationOverviewTable sourceData={results} />}</div>

      {/* <div>
        {results &&
          Object.keys(results).map((key) => (
            <div
              key={key}
              className={`grid grid-cols-2 py-4 border-b border-slate-500 ${results[key].english ? '' : ''}`}
            >
              <code>{key}</code>
              <ul>
                {Object.keys(results[key]).map((subKey) => (
                  <li key={subKey} className="mb-4 space-y-2">
                    <label className="" htmlFor={subKey}>
                      {subKey}
                    </label>
                    <Input id={subKey} value={results[key][subKey]} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div> */}
    </div>
  )
}
