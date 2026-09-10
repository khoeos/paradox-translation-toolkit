#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(repoRoot, 'apps', 'desktop')

const PLATFORMS = [
  {
    name: 'Windows',
    links: [
      { label: 'Installer', match: file => file.endsWith('.exe') },
      { label: 'Standalone', match: file => file.endsWith('.zip') && file.includes('-win') }
    ]
  },
  {
    name: 'macOS',
    links: [
      {
        label: 'Arm (Apple Silicon)',
        match: file => file.endsWith('.dmg') && file.includes('arm64')
      },
      { label: 'x64 (Intel)', match: file => file.endsWith('.dmg') && file.includes('x64') }
    ]
  },
  {
    name: 'Linux',
    links: [
      { label: '.AppImage', match: file => file.endsWith('.AppImage') },
      { label: '.deb', match: file => file.endsWith('.deb') }
    ]
  }
]

const version =
  process.argv[2] ?? JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')).version
const assetDir = process.argv[3] ?? join(repoRoot, 'dist')

const getRepoSlug = () => {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  const config = readFileSync(join(desktop, 'electron-builder.yml'), 'utf8')
  const owner = /^\s+owner:\s*(\S+)/m.exec(config)?.[1]
  const repo = /^\s+repo:\s*(\S+)/m.exec(config)?.[1]
  if (owner == null || repo == null) {
    console.error('No GITHUB_REPOSITORY, and no publish owner/repo in electron-builder.yml.')
    process.exit(1)
  }
  return `${owner}/${repo}`
}

let files
try {
  files = readdirSync(assetDir).toSorted()
} catch {
  console.error(`No asset directory at ${assetDir}, skipping the download section.`)
  process.exit(0)
}

const baseUrl = `https://github.com/${getRepoSlug()}/releases/download/v${version}`

const renderLine = platform => {
  const links = platform.links
    .map(link => {
      const file = files.find(link.match)
      return file == null ? null : `[${link.label}](${baseUrl}/${encodeURIComponent(file)})`
    })
    .filter(link => link !== null)
  return links.length === 0 ? null : `- **${platform.name}**: ${links.join(' / ')}`
}

const lines = PLATFORMS.map(renderLine).filter(line => line !== null)

if (lines.length === 0) {
  console.error(`No installer found in ${assetDir}, skipping the download section.`)
  process.exit(0)
}

process.stdout.write(`## Download\n\n${lines.join('\n')}\n\n---\n\n`)
