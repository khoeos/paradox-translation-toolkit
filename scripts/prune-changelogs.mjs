#!/usr/bin/env node
import { readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEPT = join('apps', 'desktop', 'CHANGELOG.md')

const WORKSPACE_ROOTS = ['apps', 'packages']

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const removed = []
for (const root of WORKSPACE_ROOTS) {
  let entries
  try {
    entries = readdirSync(join(repoRoot, root), { withFileTypes: true })
  } catch {
    continue
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const changelog = join(repoRoot, root, entry.name, 'CHANGELOG.md')
    if (relative(repoRoot, changelog) === KEPT) continue
    try {
      statSync(changelog)
    } catch {
      continue
    }
    rmSync(changelog)
    removed.push(relative(repoRoot, changelog))
  }
}

if (removed.length === 0) {
  console.log('No generated changelog to remove.')
} else {
  console.log(`Removed ${removed.length} changelog(s) nothing reads:`)
  for (const path of removed) console.log(`  ${path}`)
  console.log(`Kept ${KEPT}, which the release notes are built from.`)
}
