#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(repoRoot, 'apps', 'desktop')

const version =
  process.argv[2] ?? JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')).version
const changelogPath = process.argv[3] ?? join(desktop, 'CHANGELOG.md')

let changelog
try {
  changelog = readFileSync(changelogPath, 'utf8')
} catch {
  console.error(`No changelog at ${changelogPath}. Run \`pnpm changeset version\` first.`)
  process.exit(1)
}

const lines = changelog.split(/\r?\n/)
const start = lines.findIndex(line => line.trim() === `## ${version}`)
if (start === -1) {
  console.error(`No "## ${version}" section in ${changelogPath}.`)
  console.error('Versions found: ' + lines.filter(l => l.startsWith('## ')).join(', '))
  process.exit(1)
}
const rest = lines.slice(start + 1)
const end = rest.findIndex(line => line.startsWith('## '))
const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()

if (body.length === 0) {
  console.error(`The "## ${version}" section is empty.`)
  process.exit(1)
}

process.stdout.write(body + '\n')
