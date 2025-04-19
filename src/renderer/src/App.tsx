import { JSX, useEffect } from 'react'

import { ScrollArea } from '@renderer/components/ui/ScrollArea'
import Header from '@renderer/components/Header'
import LanguageConverter from '@renderer/pages/LanguageConverter'
import ModExplorer from '@renderer/pages/ModExplorer'
import { Route, Routes } from 'react-router'

function App(): JSX.Element {
  // useEffect(() => {
  //   window.api.on('updateMessage', (result) => {
  //     console.log(result)
  //   })
  // }, [])

  return (
    <>
      <Header />
      <ScrollArea className={'h-full w-full mt-16 pb-16'}>
        <Routes>
          <Route path="/" element={<LanguageConverter />} />
          <Route path="/explorer" element={<ModExplorer />} />
        </Routes>
      </ScrollArea>
    </>
  )
}

export default App
