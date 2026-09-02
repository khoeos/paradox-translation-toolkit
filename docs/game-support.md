# Adding support for a new game

A game is a `GameDefinition` literal exported from its own file in `packages/games/src/`, registered in `packages/games/src/index.ts` and covered by a row in `packages/games/test/games.test.ts`. The core packages (`parser`, `converter`) stay untouched, that's the whole point of the per-game data.

---

## 1. Add the definition

Create `packages/games/src/mygame.ts`:

```ts
import type { GameDefinition } from '@ptt/shared'

export const mygame: GameDefinition = {
  id: 'mygame', // url-safe slug, used as map key in settings
  displayName: 'My Game', // human-readable, shown in the tab strip
  steamAppId: 0, // optional, used by the path-policy allowlist
  localisationDirName: 'localisation', // or 'localization' for CK3-style
  layout: 'both', // 'flat' | 'nested-by-language' | 'both'
  userFolder: 'My Game', // the game's folder name under the user's Documents/Paradox Interactive
  languageFileToken: {
    // language code (BCP-47) -> file token used in `_l_<token>.yml`
    en: 'english',
    fr: 'french'
    // Add only the languages the game actually ships. Missing here = the
    // converter cannot target that language for this game.
  },
  overrideSubdirs: ['replace'] // empty if the game has no override layer
}

export default mygame
```

The exported const must be named exactly the game id (`packages/games/src/index.ts` imports it by that name).

### Field reference

| Field                 | Why it matters                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                  | Used as the per-game key in `lastModFolder`, `sourceLanguage`, etc. **Don't change it once shipped**, old settings would orphan.                                                           |
| `localisationDirName` | The scanner walks `**/<localisationDirName>/` and ignores everything else. CK3, EU5, Vic3, Imperator use `'localization'`; the rest use `'localisation'`.                                  |
| `layout`              | `'flat'` = files directly under `localisation/`. `'nested-by-language'` = files under `localisation/<token>/`. `'both'` = either is accepted. Most games are `'both'`.                     |
| `languageFileToken`   | The token in `<key>_l_<token>.yml`. Stellaris uses `braz_por`, CK3 uses `simp_chinese`, etc., never assume.                                                                                |
| `overrideSubdirs`     | Subfolders treated as a separate "override" namespace (translated independently from regular files). Empty for games that don't have this concept.                                         |
| `userFolder`          | The game's folder name under the user's Paradox Interactive user directory.                                                                                                                |
| `steamAppId`          | Picked up by the path-policy allowlist so users opening their Workshop folder don't see the "Authorize folder" modal (cf. [known-issues.md](./known-issues.md)). Optional but recommended. |

## 2. Register it

In `packages/games/src/index.ts`, import the new file and append it to `builtInGames`:

```ts
import { mygame } from './mygame.js'
// ...
const builtInGames: readonly GameDefinition[] = [
  stellaris,
  eu4,
  eu5,
  hoi4,
  ck3,
  vic3,
  imperator,
  mygame
]
```

Also add `mygame` to the `export { ... }` line at the bottom of the file. The order of `builtInGames` drives the order of game tabs in the UI.

## 3. Add a test row

In `packages/games/test/games.test.ts`, add a row to the `rows` table (id, displayName, steamAppId, localisationDirName, layout, userFolder, and the language tokens you want pinned) and import the new const alongside the others at the top of the file. The table-driven `describe('game definitions')` block asserts every row against the corresponding `GameDefinition`, so no separate smoke test file is needed.

## 4. Add the game image

For the tab background, drop a `.webp` image at `apps/desktop/src/renderer/src/assets/img/<id>.webp` and add it to `gameImages` in [`apps/desktop/src/renderer/src/components/GameTabs.tsx`](../apps/desktop/src/renderer/src/components/GameTabs.tsx).

## 5. Verify

```bash
pnpm --filter @ptt/games test
pnpm typecheck
pnpm test
```

No `pnpm install` is needed, there's no new workspace and no new dependency: the game lives inside the existing `packages/games` package. If all three are green, the new game shows up in the converter UI on the next `pnpm dev`.
