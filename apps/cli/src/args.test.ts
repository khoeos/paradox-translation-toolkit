import { describe, expect, it } from 'vitest'

import { parseArgs } from './args.js'

describe('parseArgs', () => {
  it('reads the command', () => {
    expect(parseArgs(['scan']).command).toBe('scan')
  })

  it('reads a flag and its value', () => {
    expect(parseArgs(['scan', '--path', '/mods']).flags.path).toBe('/mods')
  })

  it('reads an inline value', () => {
    expect(parseArgs(['scan', '--path=/mods']).flags.path).toBe('/mods')
  })

  it('reads a value-less flag as true', () => {
    expect(parseArgs(['convert', '--translate']).flags.translate).toBe(true)
  })

  it('reads a value-less flag followed by another flag as true', () => {
    const args = parseArgs(['convert', '--translate', '--path', '/mods'])
    expect(args.flags.translate).toBe(true)
    expect(args.flags.path).toBe('/mods')
  })

  it('collects the extra positionals as rest', () => {
    expect(parseArgs(['provider', 'Colony Ship', 'Men-at-Arms']).rest).toEqual([
      'Colony Ship',
      'Men-at-Arms'
    ])
  })

  it('handles an empty argv', () => {
    expect(parseArgs([])).toEqual({ command: '', flags: {}, rest: [] })
  })

  it('keeps an inline value holding an equals sign', () => {
    expect(parseArgs(['convert', '--base-url=http://h/v1?a=b']).flags['base-url']).toBe(
      'http://h/v1?a=b'
    )
  })

  it('keeps a value that looks like a path with spaces', () => {
    expect(parseArgs(['scan', '--path', 'C:/My Mods/content']).flags.path).toBe(
      'C:/My Mods/content'
    )
  })

  it('lets a later flag win over an earlier one', () => {
    expect(parseArgs(['scan', '--limit', '10', '--limit', '20']).flags.limit).toBe('20')
  })
})

describe('parseArgs - documented quirks', () => {
  it('treats -x and --x as the same flag', () => {
    expect(parseArgs(['scan', '-path', '/mods']).flags.path).toBe('/mods')
  })

  it('swallows a single-dash token as the value of the previous flag', () => {
    const args = parseArgs(['audit', '--json', '-x'])
    expect(args.flags.json).toBe('-x')
    expect(args.flags.x).toBeUndefined()
  })
})
