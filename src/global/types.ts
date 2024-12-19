import { TRANSLATE_KEYS } from './constants'

export enum IpcKey {
  CONVERT_START = 'startConversion',
  CONVERT_STATUS = 'conversionStatus',
  SELECT_FOLDER_START = 'startSelectFolder',
  SELECT_FOLDER_EXPLORER = 'startSelectFolderExplorer',
  SELECT_FOLDER_RESULT = 'folderSelected',
  SELECT_OUTPUT_START = 'startSelectOutput',
  SELECT_OUTPUT_RESULT = 'outputSelected',
  OPEN_FOLDER = 'openFolder'
}

export enum ConversionStatusType {
  LOG,
  STATUS
}

export enum ConversionLogMessage {
  STARTING = 'conversionLog.starting',
  DONE = 'conversionLog.done'
}

export enum ConversionStatus {
  WAITING,
  STARTED,
  SCANNING_FILES,
  COMPARING_FILES,
  WAITING_USER_INPUT,
  CREATING_FILES,
  FINISHED,
  ERROR
}

export enum ConvertMode {
  ADD_TO_CURRENT = 0,
  EXTRACT_TO_FOLDER = 1,
  CREATE_TRANSLATION_MOD = 2
}

export type TranslationItem = Partial<Record<(typeof TRANSLATE_KEYS)[number], string>> & {
  key_id: string
  fileName: string
  paths: Record<(typeof TRANSLATE_KEYS)[number], string>
}
