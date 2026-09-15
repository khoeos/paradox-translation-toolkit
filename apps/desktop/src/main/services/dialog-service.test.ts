import { describe, expect, it, vi } from 'vitest'

const readTextMock = vi.fn<() => string>()

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: vi.fn(), getAllWindows: vi.fn(() => []) },
  clipboard: { readText: readTextMock },
  dialog: {},
  shell: {}
}))

const { readClipboardText } = await import('./dialog-service.js')

describe('readClipboardText', () => {
  it('returns null when the clipboard is empty', async () => {
    readTextMock.mockReturnValueOnce('')

    await expect(readClipboardText()).resolves.toBeNull()
  })

  it('returns the clipboard text unchanged when within the bound', async () => {
    readTextMock.mockReturnValueOnce('/mods/some/path')

    await expect(readClipboardText()).resolves.toBe('/mods/some/path')
  })

  it('truncates clipboard text longer than the bound', async () => {
    readTextMock.mockReturnValueOnce('a'.repeat(5000))

    const result = await readClipboardText()

    expect(result).not.toBeNull()
    expect(result?.length).toBe(4096)
  })

  it('returns null instead of throwing when reading the clipboard fails', async () => {
    readTextMock.mockImplementationOnce(() => {
      throw new Error('clipboard unavailable')
    })

    await expect(readClipboardText()).resolves.toBeNull()
  })
})
