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

  it('forwards the mode to the scan-mods command, so the guard can be applied downstream', () => {
    const service = new ConverterService('/fake/worker.js', new OpenableRegistry())
    service.scanMods({
      ...scanModsInput,
      mode: 'add-to-current' as const,
      retranslateOwnKeys: true
    })
    expect(fakeWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scan-mods',
        mode: 'add-to-current',
        retranslateOwnKeys: true
      })
    )
  })

  it('forwards targetContent to the scan-mods command, so the preview matches the run', () => {
    const service = new ConverterService('/fake/worker.js', new OpenableRegistry())
    service.scanMods({
      ...scanModsInput,
      mode: 'add-to-current' as const,
      targetContent: 'complete-file' as const
    })
    expect(fakeWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'scan-mods', targetContent: 'complete-file' })
    )
  })

  it('omits targetContent from the scan-mods command when the form did not set one', () => {
    const service = new ConverterService('/fake/worker.js', new OpenableRegistry())
    service.scanMods(scanModsInput)
    const [command] = fakeWorker.postMessage.mock.calls.at(-1) ?? []
    expect(command).not.toHaveProperty('targetContent')
  })
})
