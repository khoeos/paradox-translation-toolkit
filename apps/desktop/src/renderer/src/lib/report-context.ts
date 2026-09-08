export interface ReportSettingsView {
  defaultSourceLanguage: string
  sourceLanguage: Partial<Record<string, string>>
  targetLanguages: Partial<Record<string, string[]>>
  mode: string
  targetContent: string
  themeOverride: string
  uiLanguage: string
  lastGameId: string | null
  autoCheckUpdates: boolean
  updateChannel: string
  lastModFolder: Partial<Record<string, string>>
  lastOutputFolder: Partial<Record<string, string>>
  gamePath: Partial<Record<string, string>>
  userAllowedFolders: string[]
}

export interface ReportJobView {
  status: string
  modsProcessed: number
  modsTotal: number
  errorMessage: string | null
}

const formatRecord = (record: Partial<Record<string, string>>): string =>
  Object.entries(record)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')

const JOB_ERROR_LIMIT = 200

export const formatReportPage = (pathname: string, selectedGameId: string | null): string =>
  selectedGameId ? `${pathname} (game: ${selectedGameId})` : pathname

export const formatReportSettings = (settings: ReportSettingsView): string => {
  const lines = [
    `Mode: ${settings.mode}`,
    `Content: ${settings.targetContent}`,
    `Default source: ${settings.defaultSourceLanguage}`,
    `UI language: ${settings.uiLanguage}`,
    `Theme: ${settings.themeOverride}`,
    `Update channel: ${settings.updateChannel}`,
    `Auto-update: ${settings.autoCheckUpdates}`,
    `Last game: ${settings.lastGameId ?? 'none'}`
  ]

  const sourceLangs = Object.entries(settings.sourceLanguage)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([game, lang]) => `${game}=${lang}`)
    .join(', ')
  if (sourceLangs) lines.push(`Source langs: ${sourceLangs}`)

  const targetLangs = Object.entries(settings.targetLanguages)
    .filter((entry): entry is [string, string[]] => entry[1] !== undefined)
    .map(([game, langs]) => `${game}=${langs.join('+')}`)
    .join(', ')
  if (targetLangs) lines.push(`Target langs: ${targetLangs}`)

  return lines.join('\n')
}

export const formatReportPaths = (settings: ReportSettingsView): string => {
  const lines: string[] = []
  const modFolders = formatRecord(settings.lastModFolder)
  if (modFolders) lines.push(`Mod folders: ${modFolders}`)
  const outputFolders = formatRecord(settings.lastOutputFolder)
  if (outputFolders) lines.push(`Output folders: ${outputFolders}`)
  const gamePaths = formatRecord(settings.gamePath)
  if (gamePaths) lines.push(`Game paths: ${gamePaths}`)
  if (settings.userAllowedFolders.length > 0) {
    lines.push(`Allowed folders: ${settings.userAllowedFolders.join(', ')}`)
  }
  return lines.join('\n')
}

export const formatReportJobs = (jobs: ReportJobView[]): string[] =>
  jobs.map(job => {
    const base = `${job.status} - ${job.modsProcessed}/${job.modsTotal} mods`
    if (job.status === 'error' && job.errorMessage) {
      return `${base} - ${job.errorMessage.slice(0, JOB_ERROR_LIMIT)}`
    }
    return base
  })
