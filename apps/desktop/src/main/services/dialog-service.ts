import { TRPCError } from '@trpc/server'
import { BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

import type { OpenableRegistry } from './openable-registry.js'
import { canonicalize, isCriticalFolder, isWellKnownParadoxPath } from './path-policy.js'
import type { SettingsService } from './settings-service.js'

async function isExistingDirectory(path: string): Promise<boolean> {
  try {
    const s = await fs.stat(path)
    return s.isDirectory()
  } catch {
    return false
  }
}

async function isExistingFile(path: string): Promise<boolean> {
  try {
    const s = await fs.stat(path)
    return s.isFile()
  } catch {
    return false
  }
}

function getOwnerWindow(): BrowserWindow {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'No application window available to host the dialog'
    })
  }
  return win
}

export interface DialogServiceDeps {
  settings: SettingsService
  openable: OpenableRegistry
}

let deps: DialogServiceDeps | null = null

export function configureDialogService(d: DialogServiceDeps): void {
  deps = d
}

function requireDeps(): DialogServiceDeps {
  if (!deps) {
    throw new Error('dialogService used before configureDialogService(...)')
  }
  return deps
}

/**
 * Authorisation pipeline for `openPath`. Layers, evaluated in order :
 * 1. Path must exist and be a directory (defence against arbitrary file launch).
 * 2. Critical OS folder → hard refuse, no modal.
 * 3. Permitted via any of : OpenableRegistry, well-known Paradox path,
 *    persisted `userAllowedFolders`, or session-scoped allow-once.
 * 4. Otherwise prompt the user with a 3-button modal (Cancel / Allow once /
 *    Always allow). "Always" persists to settings ; "Once" caches in memory.
 *
 * A per-canonical-path mutex dedupes simultaneous prompts for the same folder.
 */
const pendingApprovals = new Map<string, Promise<'cancel' | 'once' | 'always'>>()

async function promptUserForApproval(
  win: BrowserWindow,
  canonicalPath: string,
  displayPath: string
): Promise<'cancel' | 'once' | 'always'> {
  const existing = pendingApprovals.get(canonicalPath)
  if (existing) return existing
  const promise = (async () => {
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Authorize folder?',
      message: 'This folder is outside of typical Paradox paths.',
      detail: `Open and remember it as an allowed folder?\n\n${displayPath}`,
      buttons: ['Cancel', 'Allow once', 'Always allow'],
      cancelId: 0,
      defaultId: 0,
      noLink: true
    })
    if (result.response === 1) return 'once'
    if (result.response === 2) return 'always'
    return 'cancel'
  })().finally(() => {
    pendingApprovals.delete(canonicalPath)
  })
  pendingApprovals.set(canonicalPath, promise)
  return promise
}

export const dialogService = {
  async pickFolder(opts?: { defaultPath?: string | undefined }): Promise<string | null> {
    const win = getOwnerWindow()
    const safeDefaultPath =
      opts?.defaultPath !== undefined && (await isExistingDirectory(opts.defaultPath))
        ? opts.defaultPath
        : undefined
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      ...(safeDefaultPath !== undefined && { defaultPath: safeDefaultPath })
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  },

  async openPath(rawPath: string): Promise<void> {
    const { settings, openable } = requireDeps()
    const canonical = canonicalize(rawPath)

    if (!(await isExistingDirectory(rawPath))) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Path is not an existing directory: ${rawPath}`
      })
    }

    if (isCriticalFolder(rawPath)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Refusing to open critical system folder: ${rawPath}`
      })
    }

    const userAllowedFolders = settings.getAll().userAllowedFolders
    const alreadyApproved =
      openable.has(rawPath) ||
      openable.hasSession(rawPath) ||
      isWellKnownParadoxPath(rawPath) ||
      userAllowedFolders.includes(canonical)

    if (alreadyApproved) {
      await runShellOpen(rawPath)
      return
    }

    const win = getOwnerWindow()
    const choice = await promptUserForApproval(win, canonical, rawPath)
    if (choice === 'cancel') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `User declined to authorise folder: ${rawPath}`
      })
    }
    if (choice === 'always') {
      settings.addAllowedFolder(canonical)
    } else {
      openable.addSession(rawPath)
    }
    await runShellOpen(rawPath)
  },

  async showItemInFolder(rawPath: string): Promise<void> {
    const { openable } = requireDeps()

    if (!(await isExistingFile(rawPath))) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Path is not an existing file: ${rawPath}`
      })
    }

    if (isCriticalFolder(dirname(rawPath))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Refusing to reveal a file in a critical system folder: ${rawPath}`
      })
    }

    if (!openable.has(rawPath) && !openable.hasSession(rawPath)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Not a path this app produced: ${rawPath}`
      })
    }

    shell.showItemInFolder(rawPath)
  }
}

async function runShellOpen(path: string): Promise<void> {
  const errorMessage = await shell.openPath(path)
  if (errorMessage.length > 0) {
    throw new Error(errorMessage)
  }
}
