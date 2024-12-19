/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs/promises'
import path from 'path'
import { TRANSLATE_KEYS } from '../../global/constants'

// List all .yml files and build the initial jsonResult
async function listTradFiles(
  dirPath: string,
  translateKey: string
): Promise<{ ymlFiles: string[]; jsonResult: any }> {
  const ymlFiles: string[] = []
  const jsonResult: Record<string, any> = {}

  const items = await fs.readdir(dirPath, { withFileTypes: true })

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name)

    if (item.isDirectory()) {
      // Recursively list files and merge results
      const { ymlFiles: subYmlFiles, jsonResult: subJsonResult } = await listTradFiles(
        fullPath,
        translateKey
      )
      ymlFiles.push(...subYmlFiles)
      Object.assign(jsonResult, subJsonResult)
    } else if (
      item.isFile() &&
      fullPath.endsWith('.yml') &&
      fullPath.split(path.sep).includes(translateKey) &&
      !fullPath.includes('replace')
    ) {
      ymlFiles.push(fullPath)
      jsonResult[path.basename(fullPath)] = { path: fullPath, keys: {} }
    }
  }

  return { ymlFiles, jsonResult }
}

// Extract translation keys from a file
async function extractKeysFromFile(filePath: string, jsonResult: any): Promise<void> {
  const fileContent = await fs.readFile(filePath, 'utf-8')
  const regex = /(.*?:\d+) *"(.*?)"/gm
  let match: RegExpExecArray | null

  while ((match = regex.exec(fileContent)) !== null) {
    const key = match[1].trim()
    const value = match[2]
    if (!key.startsWith('#')) {
      jsonResult[path.basename(filePath)].keys[key] = value
    }
  }
}

// Clean up jsonResult by removing empty properties
function removeEmptyProperties(jsonResult: any): any {
  for (const key in jsonResult) {
    if (!jsonResult[key].keys || Object.keys(jsonResult[key].keys).length === 0) {
      delete jsonResult[key]
    }
  }
  return jsonResult
}

// Parse the directory and process translation files
export const parseFiles = async (dirPath: string): Promise<unknown> => {
  try {
    const { ymlFiles, jsonResult } = await listTradFiles(dirPath, 'localisation')

    // Extract keys from each file asynchronously
    await Promise.all(
      ymlFiles
        .filter((file) => file.includes('english'))
        // .slice(0, 50)
        .map((filePath) => extractKeysFromFile(filePath, jsonResult))
    )

    // Remove empty entries
    const cleaned = removeEmptyProperties(jsonResult)

    const data = { total: 0 }
    const jsonResult2: any = {}
    const languageRegex = /_l_(.*?)\.yml/

    for (const fileKey of Object.keys(cleaned)) {
      const matchResult = fileKey.match(languageRegex)
      const languageKey = matchResult ? matchResult[1] : null
      if (!languageKey || !TRANSLATE_KEYS.includes(languageKey)) continue

      const fileName = fileKey.replace(`_l_${languageKey}.yml`, '')

      if (!data[languageKey]) data[languageKey] = 0

      data[languageKey] += Object.keys(cleaned[fileKey].keys).length

      for (const translateKey of Object.keys(cleaned[fileKey].keys)) {
        if (!jsonResult2[translateKey]) {
          jsonResult2[translateKey] = { paths: {}, fileName }
        }
        jsonResult2[translateKey][languageKey] = cleaned[fileKey].keys[translateKey]
        jsonResult2[translateKey].paths[languageKey] = cleaned[fileKey].path
      }
    }

    data.total = Object.keys(jsonResult2).length

    return { data, keys: jsonResult2 }
  } catch (error) {
    console.error('Error during parsing:', error)
  }
  return null
}

export const createFile = async () => {
  const { keys } = await parseFiles(
    'C:/Users/Ljeanjean/Documents/Paradox text/new/3412590987/localisation'
  )
  // create a file
  // add `l_french: ` at the beginning of the file
  // for each Object.keys(keys)
  // write in the file : `${key}: ${keys['english']}`
  // save the file in C:/Users/Ljeanjean/Documents/Paradox text/new

  let fileContent = 'l_french:\n\n'
  for (const key of Object.keys(keys)) {
    fileContent += `${key}: ${keys[key].english}\n`
  }

  await fs.writeFile(
    'C:/Users/Ljeanjean/Documents/Paradox text/new/replace_l_french.yml',
    fileContent,
    { encoding: 'utf8', flag: 'wx' }
  )

  console.log(fileContent)
}
