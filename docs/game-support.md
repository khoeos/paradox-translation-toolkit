# Adding support for a new game

A game is a self-contained workspace package: a single `GameDefinition` plus a smoke test. The core packages (`parser-core`, `converter-core`) stay untouched, that's the whole point of the per-game layout.

---

## 1. Create the package

```bash
cp -r games/game-stellaris games/game-<id>
```

Then in `games/game-<id>/`:

- **`package.json`**: rename `"name"` to `@ptt/game-<id>`.
- **`src/index.ts`**: replace the export with your game's `GameDefinition` (see fields below).
- **`test/smoke.test.ts`**: rename the import and update the asserted ID/displayName.

```ts
import type { GameDefinition } from '@ptt/shared-types'

export const myGame: GameDefinition = {
  id: 'my-game', // url-safe slug, used as map key in settings
  displayName: 'My Game', // human-readable, shown in the tab strip
  steamAppId: 0, // optional, used by the path-policy allowlist
  localisationDirName: 'localisation', // or 'localization' for CK3-style
  layout: 'both', // 'flat' | 'nested-by-language' | 'both'
  languageFileToken: {
    // language code (BCP-47) → file token used in `_l_<token>.yml`
    en: 'english',
    fr: 'french'
    // Add only the languages the game actually ships. Missing here = the
    // converter cannot target that language for this game.
  },
  overrideSubdirs: ['replace'] // empty if the game has no override layer
}

export default myGame
```

### Field reference

| Field                 | Why it matters                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                  | Used as the per-game key in `lastModFolder`, `sourceLanguage`, etc. **Don't change it once shipped**, old settings would orphan.                                                           |
| `localisationDirName` | The scanner walks `**/<localisationDirName>/` and ignores everything else. CK3, EU5, Vic3, Imperator use `'localization'`; the rest use `'localisation'`.                                  |
| `layout`              | `'flat'` = files directly under `localisation/`. `'nested-by-language'` = files under `localisation/<token>/`. `'both'` = either is accepted. Most games are `'both'`.                     |
| `languageFileToken`   | The token in `<key>_l_<token>.yml`. Stellaris uses `braz_por`, CK3 uses `simp_chinese`, etc., never assume.                                                                                |
| `overrideSubdirs`     | Subfolders treated as a separate "override" namespace (translated independently from regular files). Empty for games that don't have this concept.                                         |
| `steamAppId`          | Picked up by the path-policy allowlist so users opening their Workshop folder don't see the "Authorize folder" modal (cf. [known-issues.md](./known-issues.md)). Optional but recommended. |

## 2. Register it

In `games/game-registry/src/index.ts`, import the new package and append it to `builtInGames`:

```ts
import { myGame } from '@ptt/game-my-game'
// ...
const builtInGames: readonly GameDefinition[] = [
  stellaris,
  eu4,
  eu5,
  hoi4,
  ck3,
  vic3,
  imperator,
  myGame
]
```

The order of this array drives the order of game tabs in the UI.

## 3. Wire the workspace dependency

`games/game-registry/package.json` and `apps/desktop/package.json` both list every game package as a workspace dep. Add yours to both, then re-run `pnpm install`.

## 4. Add the game image

For the tab background, drop a `.webp` image at `apps/desktop/src/renderer/src/assets/img/<id>.webp` and add it to `gameImages` in [`apps/desktop/src/renderer/src/components/GameTabs.tsx`](../apps/desktop/src/renderer/src/components/GameTabs.tsx).

## 5. Verify

```bash
pnpm --filter @ptt/game-<id> test
pnpm --filter @ptt/game-registry test  # extensibility check passes
pnpm typecheck
pnpm test
```

If all four are green, the new game shows up in the converter UI on the next `pnpm dev`.
