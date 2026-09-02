import type { GameDefinition } from '@ptt/shared'

import { DEFAULT_MOD_FOLDER, DEFAULT_MOD_NAME, GENERATED_MOD_FOLDER_MAX_LEN } from './constants.js'
import { sanitizeFolderName } from './naming.js'
import { posixJoin } from './path.js'

export interface GeneratedModPaths {
  modsDir: string
  folder: string
  path: string
  name: string
}

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
