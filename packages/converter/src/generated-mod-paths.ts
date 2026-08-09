import type { GameDefinition } from '@ptt/shared'

import { DEFAULT_MOD_FOLDER, DEFAULT_MOD_NAME, GENERATED_MOD_FOLDER_MAX_LEN } from './constants.js'
import { sanitizeFolderName } from './naming.js'
import { posixJoin } from './path.js'

/**
 * Where the generated translation mod lives.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `resolveGeneratedMod`) by
 * Artem Kondrashev. It lives here rather than in `apps/desktop` because `apps/cli` needs the very
 * same answer: only the caller knows where the user's Documents folder is, and that is a
 * parameter, not a reason for a second implementation. The two had already drifted on an
 * all-whitespace mod name.
 *
 * If this formula ever disagrees between the two front ends, `scanMods` stops finding what the
 * other one wrote, reports every key as missing and pays a translator for the whole collection
 * again.
 */
export interface GeneratedModPaths {
  /** `Documents/Paradox Interactive/<userFolder>/mod`, which the launcher reads. */
  modsDir: string
  /** Folder name below `modsDir`, also the name of the outer `.mod` file. */
  folder: string
  /** Path of the mod folder itself. */
  path: string
  /** Name shown in the launcher. */
  name: string
}

/**
 * Resolve the generated mod of a run, whether or not it exists yet.
 * @param documentsPath - The user's Documents folder
 * @param game - The selected game, for its `userFolder`
 * @param modName - The name the user typed, empty for the default
 * @returns Where the mod goes, and under which name
 */
export function resolveGeneratedMod(
  documentsPath: string,
  game: Pick<GameDefinition, 'userFolder'>,
  modName?: string
): GeneratedModPaths {
  const modsDir = posixJoin(documentsPath, 'Paradox Interactive', game.userFolder, 'mod')
  const name = modName?.trim() || DEFAULT_MOD_NAME
  const folder = sanitizeFolderName(name, GENERATED_MOD_FOLDER_MAX_LEN) || DEFAULT_MOD_FOLDER
  return { modsDir, folder, path: posixJoin(modsDir, folder), name }
}
