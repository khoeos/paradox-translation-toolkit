import { describe, expect, it } from 'vitest'

import { OpenableRegistry } from './openable-registry.js'

describe('OpenableRegistry', () => {
  it('accepts a file and its parent from one call', () => {
    const registry = new OpenableRegistry()
    registry.addFileAndParent('C:/reports/run-1.json')
    expect(registry.has('C:/reports/run-1.json')).toBe(true)
    expect(registry.has('C:/reports')).toBe(true)
  })

  it('knows nothing it was not given', () => {
    const registry = new OpenableRegistry()
    registry.addFileAndParent('C:/reports/run-1.json')
    expect(registry.has('C:/reports/run-2.json')).toBe(false)
    expect(registry.has('C:/windows/system32')).toBe(false)
  })

  it('keeps a session grant out of the persistent set', () => {
    const registry = new OpenableRegistry()
    registry.addSession('C:/elsewhere')
    expect(registry.hasSession('C:/elsewhere')).toBe(true)
    expect(registry.has('C:/elsewhere')).toBe(false)
  })

  it('ignores an empty path rather than authorising everything', () => {
    const registry = new OpenableRegistry()
    registry.add('')
    registry.addFileAndParent('')
    registry.addSession('')
    expect(registry.has('')).toBe(false)
    expect(registry.hasSession('')).toBe(false)
  })
})
