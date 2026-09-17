import { describe, expect, it, vi } from 'vitest'

const fakeWorker = {
  on: vi.fn(),
  once: vi.fn(),
  postMessage: vi.fn(),
  kill: vi.fn(),
  stdout: null,
  stderr: null
}

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  utilityProcess: { fork: vi.fn(() => fakeWorker) }
}))

vi.mock('../log.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { ConverterService } from './converter-service.js'
import { OpenableRegistry } from './openable-registry.js'

const scanModsInput = {
  gameId: 'hoi4',
  rootDir: '/mods',
  sourceLanguage: 'en' as const,
  targets: [{ language: 'fr', fileToken: 'french' }],
  mode: 'create-translation-mod' as const
}

describe('ConverterService', () => {
  it('forwards retranslateOwnKeys to the scan-mods worker command', () => {
    const service = new ConverterService('/fake/worker.js', new OpenableRegistry())
    service.scanMods({ ...scanModsInput, retranslateOwnKeys: true })
    expect(fakeWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'scan-mods', retranslateOwnKeys: true })
    )
  })

  it('omits retranslateOwnKeys from the scan-mods command when not requested', () => {
    const service = new ConverterService('/fake/worker.js', new OpenableRegistry())
    service.scanMods(scanModsInput)
    const [command] = fakeWorker.postMessage.mock.calls.at(-1) ?? []
    expect(command).not.toHaveProperty('retranslateOwnKeys')
  })

  it('forwards retranslateOwnKeys to the convert worker command', () => {
    const service = new ConverterService('/fake/worker.js', new OpenableRegistry())
    service.convert({
      ...scanModsInput,
      mode: 'create-translation-mod' as const,
      retranslateOwnKeys: true
    })
    expect(fakeWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'convert', retranslateOwnKeys: true })
    )
  })

  it('drops retranslateOwnKeys from the scan-mods command when it has no effect in add-to-current', () => {
    const service = new ConverterService('/fake/worker.js', new OpenableRegistry())
    service.scanMods({
      ...scanModsInput,
      mode: 'add-to-current' as const,
      retranslateOwnKeys: true
    })
    const [command] = fakeWorker.postMessage.mock.calls.at(-1) ?? []
    expect(command).not.toHaveProperty('retranslateOwnKeys')
  })

  it('keeps retranslateOwnKeys in the scan-mods command outside add-to-current', () => {
    const service = new ConverterService('/fake/worker.js', new OpenableRegistry())
    service.scanMods({
      ...scanModsInput,
      mode: 'create-translation-mod' as const,
      retranslateOwnKeys: true
    })
    expect(fakeWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'scan-mods', retranslateOwnKeys: true })
    )
  })
})
