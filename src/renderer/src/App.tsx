import { ScrollArea } from '@renderer/components/ui/ScrollArea'
import Header from '@renderer/components/Header'
import LanguageConverter from '@renderer/pages/LanguageConverter'
import ModExplorer from '@renderer/pages/ModExplorer'

function App(): JSX.Element {
  return (
    <>
      <Header />
      <ScrollArea className={'h-full w-full mt-16 pb-16'}>
        <ModExplorer />
        {/* <LanguageConverter /> */}
      </ScrollArea>
    </>
  )
}

export default App
