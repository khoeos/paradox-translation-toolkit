import * as fs from 'fs'
import * as path from 'path'
import { GAMES } from '../../global/constants'
import {
  ConversionLogMessage,
  ConversionStatus,
  ConversionStatusType,
  ConvertMode
} from '../../global/types'

export interface Request {
  path: string
  game: string
  sourceLanguage: string
  targetLanguages: string[]
  mode: ConvertMode
  outputPath?: string
}

/**
 * Recursively list all .yml translation files in a directory
 * @param dirPath - The directory path to search
 * @param translateKey - The game's folder translate key
 * @returns Array of .yml file paths
 */
function listTradFiles(dirPath: string, translateKey: string): string[] {
  let ymlFiles: string[] = []

  const items = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name)

    if (item.isDirectory()) {
      // Recursively list files from subdirectories
      ymlFiles = ymlFiles.concat(listTradFiles(fullPath, translateKey))
    } else if (
      item.isFile() && //                                       Is a file
      fullPath.endsWith('.yml') && //                           Is a .yml file
      fullPath.split('\\').indexOf(translateKey) !== -1 && //   Is in localisation folder
      !fullPath.includes('replace') //                          TODO: Manage the replace folder
    ) {
      ymlFiles.push(fullPath)
    }
  }

  return ymlFiles
}

/**
 * Filter files from a source language
 * @param files - Array of file paths
 * @param translateKey - The game's folder translate key
 * @param sourceLanguage - The source language to filter
 * @returns Array of file paths
 */
function filterFilesFromSourceLanguage(
  files: string[],
  translateKey: string,
  sourceLanguage: string
): string[] {
  // translateKeyIndex + 2 === filePathParts.length => the file is at the root of the localization folder
  // sourceLanguageIndex !== -1 => the file is in a subfolder named after the source language
  return files.filter((file) => {
    const filePathParts = file.split('\\')
    const sourceLanguageIndex = filePathParts.indexOf(sourceLanguage ?? 'english')
    const translateKeyIndex = filePathParts.indexOf(translateKey)
    return (
      sourceLanguageIndex !== -1 ||
      (translateKeyIndex + 2 === filePathParts.length && file.includes(sourceLanguage))
    )
  })
}

/**
 * Get the target files paths
 * @param sourceFiles - Array of source files paths
 * @param sourceLanguage - The source language
 * @param targetLanguage - The target language
 * @returns Array of target files paths
 */
const getTargetFiles = (
  sourceFiles: string[],
  sourceLanguage: string,
  targetLanguage: string
): string[] => {
  return sourceFiles.map((file) => {
    return file.replaceAll(sourceLanguage, targetLanguage)
  })
}

/**
 * Return a list of translation files that are not present in the target directory
 * @param sourceFiles - Array of source files paths
 * @param targetFiles - Array of target files paths
 * @returns Array of absent target files paths
 */
const getAbsentTargetFiles = (sourceFiles: string[], targetFiles: string[]): string[] => {
  return targetFiles.filter((file) => !sourceFiles.includes(file))
}

/**
 * Create new files from a list of absent target files
 * @param game - The game key
 * @param absentTargetFiles - Array of absent target files paths
 * @param sourceLanguage - The source language
 * @param targetLanguage - The target language
 * @param outputDir - The output directory
 */
const createNewFiles = async (
  game: string,
  absentTargetFiles: string[],
  sourceLanguage: string,
  targetLanguage: string,
  outputDir?: string
): Promise<{ createdFiles: string[]; failedFiles: string[] }> => {
  const createdFiles: string[] = []
  const failedFiles: string[] = []
  await Promise.all(
    absentTargetFiles.map(async (file) => {
      try {
        const sourcePath = file.replaceAll(targetLanguage, sourceLanguage)

        const sourceContent = fs.readFileSync(sourcePath, { encoding: 'utf8', flag: 'r' })
        const targetContent = sourceContent.replaceAll(`l_${sourceLanguage}`, `l_${targetLanguage}`)

        if (outputDir) {
          const splittedPath = file.split('\\')
          const modFolderIndex = splittedPath.indexOf(GAMES[game].translateKey) - 1
          if (!modFolderIndex) throw new Error('Mod folder not found')
          const relativePath = splittedPath.slice(modFolderIndex).join('\\')
          const targetPath = path.join(outputDir, relativePath)
          const dirPath = targetPath.split('\\').slice(0, -1).join('\\')
          fs.mkdirSync(dirPath, { recursive: true })
          fs.writeFileSync(targetPath, targetContent, { encoding: 'utf8', flag: 'wx' })
          createdFiles.push(targetPath)
        } else {
          const dirPath = file.split('\\').slice(0, -1).join('\\')
          fs.mkdirSync(dirPath, { recursive: true })
          fs.writeFileSync(file, targetContent)
          createdFiles.push(file)
        }
      } catch (error) {
        console.error(error, file)
        failedFiles.push(file)
      }
    })
  )
  return { createdFiles, failedFiles }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// const getAllkeysOfFile = (file: string, sourceLanguage: string): Record<string, string> => {
//   const keyValuePairs: Record<string, string> = {}
//   const lines = file.split('\n')

//   const filteredLines = lines.filter((line) => {
//     return (
//       line.trim() &&
//       line.includes(':') &&
//       line.includes('"') &&
//       !line.includes(`l_${sourceLanguage}`)
//     )
//   })

//   for (const line of filteredLines) {
//     const keyBaseIndex = line.indexOf(':')
//     const firstSpace = line.indexOf(' ', keyBaseIndex)

//     const key = line.slice(0, firstSpace).trim()
//     if (!key.startsWith('#')) {
//       const value = line
//         .slice(firstSpace + 1)
//         .trim()
//         .replace(/^"|"$/g, '')

//       keyValuePairs[key] = value
//     }
//   }

//   return keyValuePairs
// }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const launchTranslation = async (request: Request, workerPort: any): Promise<unknown> => {
  const addLog = (message: string, data?: unknown): void => {
    workerPort.postMessage({
      type: ConversionStatusType.LOG,
      ts: Date.now(),
      message,
      data
    })
  }

  const { path, game, sourceLanguage, targetLanguages, mode, outputPath } = request
  addLog(ConversionLogMessage.STARTING)
  workerPort.postMessage({
    type: ConversionStatusType.STATUS,
    status: ConversionStatus.SCANNING_FILES
  })
  const allFiles = listTradFiles(path, GAMES[game].translateKey)
  addLog(`${allFiles.length} files scranned`)
  const files = filterFilesFromSourceLanguage(allFiles, GAMES[game].translateKey, sourceLanguage)
  addLog(`${files.length} files from source language`)

  const targetFiles = {}

  workerPort.postMessage({
    type: ConversionStatusType.STATUS,
    status: ConversionStatus.COMPARING_FILES
  })
  targetLanguages.forEach((language) => {
    const languageTargetFiles = getAbsentTargetFiles(
      allFiles,
      getTargetFiles(files, sourceLanguage, language)
    )
    if (languageTargetFiles.length > 0) {
      targetFiles[language] = languageTargetFiles
    }
  })

  const nTargetFiles = Object.keys(targetFiles).reduce(
    (acc, language) => acc + targetFiles[language].length,
    0
  )
  addLog(`${nTargetFiles} files missing`)

  const output = {}
  workerPort.postMessage({
    type: ConversionStatusType.STATUS,
    status: ConversionStatus.CREATING_FILES
  })
  await Promise.all(
    Object.keys(targetFiles).map(async (language) => {
      output[language] = await createNewFiles(
        game,
        targetFiles[language],
        sourceLanguage,
        language,
        mode === ConvertMode.EXTRACT_TO_FOLDER ? outputPath : undefined
      )
    })
  )
  addLog(ConversionLogMessage.DONE)
  return output
}

export default launchTranslation
