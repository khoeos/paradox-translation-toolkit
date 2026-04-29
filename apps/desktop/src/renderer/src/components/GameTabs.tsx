import { cn } from '@ptt/ui/lib/utils'

import ck3Img from '@renderer/assets/img/ck3.webp'
import eu4Img from '@renderer/assets/img/eu4.webp'
import eu5Img from '@renderer/assets/img/eu5.webp'
import hoi4Img from '@renderer/assets/img/hoi4.webp'
import imperatorImg from '@renderer/assets/img/imperator.webp'
import stellarisImg from '@renderer/assets/img/stellaris.webp'
import vic3Img from '@renderer/assets/img/vic3.webp'
import { trpc } from '@renderer/lib/trpc'
import { useConverterFormStore } from '@renderer/store/converter-form'

const gameImages: Record<string, string> = {
  stellaris: stellarisImg,
  hoi4: hoi4Img,
  eu4: eu4Img,
  eu5: eu5Img,
  ck3: ck3Img,
  vic3: vic3Img,
  imperator: imperatorImg
}

export function GameTabs() {
  const { data, isLoading } = trpc.games.list.useQuery()
  const selectedGameId = useConverterFormStore(s => s.selectedGameId)
  const setGame = useConverterFormStore(s => s.setGame)

  if (isLoading || !data) {
    return <div className="h-32 rounded-lg bg-muted animate-pulse" />
  }

  const selected = data.find(g => g.id === selectedGameId) ?? null

  return (
    <>
      {selected ? (
        <div
          className="fixed inset-0 -z-50 bg-cover bg-center opacity-80 m-0 p-0"
          style={{ backgroundImage: `url(${gameImages[selected.id] ?? ''})` }}
        />
      ) : null}

      <div className="flex gap-2 p-2 rounded-lg border bg-card/70! bg-opacity-50 backdrop-blur-sm">
        {data.map(game => (
          <button
            key={game.id}
            type="button"
            onClick={() => setGame(game.id)}
            className={cn(
              'flex-1 px-4 py-3 rounded-md text-sm font-medium transition-colors',
              'hover:bg-accent',
              selectedGameId === game.id
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-muted-foreground'
            )}
          >
            {game.displayName}
          </button>
        ))}
      </div>
    </>
  )
}
