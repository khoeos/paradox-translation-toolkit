import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { RegistryLike } from '@ptt/shared'

const execFileAsync = promisify(execFile)

const REG_QUERY_TIMEOUT_MS = 5000
const REG_QUERY_MAX_BUFFER = 65536
const REG_KEY_HEADER_PATTERN = /^HKEY_[A-Z_]+\\/
const REG_VALUE_LINE_PATTERN = /^\s+(.+?)\s{2,}REG_[A-Z_]+\s{2,}(.*)$/

const regBinaryPath = (): string => `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\reg.exe`

export const parseRegQueryOutput = (singleKeyBlockStdout: string, valueName: string): string | undefined => {
  let sawKeyHeader = false
  for (const line of singleKeyBlockStdout.split(/\r?\n/)) {
    if (REG_KEY_HEADER_PATTERN.test(line)) {
      if (sawKeyHeader) break
      sawKeyHeader = true
      continue
    }
    const match = REG_VALUE_LINE_PATTERN.exec(line)
    if (!match) continue
    const name = match[1]
    const rawValue = match[2]
    if (name === undefined || rawValue === undefined) continue
    if (name !== valueName) continue
    const value = rawValue.trim()
    if (value === '') continue
    return value
  }
  return undefined
}

export const nodeRegistry: RegistryLike = {
  async readValue(hive, key, name) {
    if (process.platform !== 'win32') return undefined
    const fullKey = `${hive}\\${key}`
    try {
      const { stdout } = await execFileAsync(regBinaryPath(), ['query', fullKey, '/v', name], {
        timeout: REG_QUERY_TIMEOUT_MS,
        maxBuffer: REG_QUERY_MAX_BUFFER,
        windowsHide: true
      })
      return parseRegQueryOutput(stdout, name)
    } catch {
      return undefined
    }
  }
}
