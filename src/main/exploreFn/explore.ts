import * as fs from 'fs'
import * as path from 'path'

const listAllMods = (dirPath: string): any => {
  let modFiles: string[] = []

  const items = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name)
    if (item.isDirectory()) {
      // Recursively list files from subdirectories
      modFiles = modFiles.concat(listAllMods(fullPath))
    } else if (
      item.isFile() && //                                       Is a file
      fullPath.endsWith('.mod')
    ) {
      modFiles.push(fullPath)
    }
  }

  return modFiles
}

export const exploreFolder = (dirPath: string): any => {
  const modFiles = listAllMods(dirPath)
  console.log(modFiles)
  const mods = modFiles.map((modFile) => {
    const mod = fs.readFileSync(modFile, 'utf-8')
    const modDetails = parseModFile(mod)
    return {
      ...modDetails,
      location: modFile,
      localisationPath: path.join(path.dirname(modFile), 'localisation'),
      ...(modDetails.picture && {
        picturePath: path.join(path.dirname(modFile), modDetails.picture)
      })
      // picturePath: path.join(path.dirname(modFile), modDetails.picture)
    }
  })
  console.log(mods)
}

const parseModFile = (content) => {
  const lines = content.split('\n')
  const jsonObject = {}

  lines.forEach((line) => {
    line = line.trim()

    // Ignore les lignes vides
    if (!line) return

    // Gestion des paires clé-valeur
    const keyValueMatch = line.match(/^(\w+)\s*=\s*"?(.*?)"?$/)
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch
      jsonObject[key] = isNaN(value) || value.includes('.') ? value : parseFloat(value)
      return
    }

    // Gestion des tableaux
    const arrayMatch = line.match(/^(\w+)\s*=\s*{\s*(.*?)\s*}$/)
    if (arrayMatch) {
      const [, key, arrayContent] = arrayMatch
      jsonObject[key] = arrayContent.split(/,\s*/).map((item) => item.replace(/"/g, ''))
      return
    }
  })

  return jsonObject
}
