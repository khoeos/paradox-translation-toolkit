import { chmodSync, existsSync, lstatSync, readdirSync, readlinkSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const EXEC_BITS = 0o111
const binDir = resolve(import.meta.dirname, '../node_modules/.bin')

if (process.platform !== 'win32' && existsSync(binDir)) {
  for (const name of readdirSync(binDir)) {
    const link = resolve(binDir, name)
    if (!lstatSync(link).isSymbolicLink()) continue
    const target = resolve(dirname(link), readlinkSync(link))
    if (!existsSync(target)) continue
    const { mode } = statSync(target)
    if ((mode & EXEC_BITS) === 0) {
      chmodSync(target, mode | 0o755)
      console.log(`fix-bin-modes: made ${name} executable`)
    }
  }
}
