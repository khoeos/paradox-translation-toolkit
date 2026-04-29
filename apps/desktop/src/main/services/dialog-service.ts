import { TRPCError } from '@trpc/server'
import { BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'

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
    // Drop defaultPath if it no longer exists; Electron then uses its own default.
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

    // Layer 1 : path must be an existing directory.
    if (!(await isExistingDirectory(rawPath))) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Path is not an existing directory: ${rawPath}`
      })
    }

    // Layer 2: OS-critical folders, never opened.
    if (isCriticalFolder(rawPath)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Refusing to open critical system folder: ${rawPath}`
      })
    }

    // Layer 3 : pre-approved sources.
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

    // Layer 4 : interactive bypass.
    const win = getOwnerWindow()
    const choice = await promptUserForApproval(win, canonical, rawPath)
    if (choice === 'cancel') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `User declined to authorise folder: ${rawPath}`
      })
    }
    if (choice === 'always') {
      // Persist BEFORE opening so a crash mid-shell.openPath still preserves
      // the authorisation on next launch.
      settings.addAllowedFolder(canonical)
    } else {
      openable.addSession(rawPath)
    }
    await runShellOpen(rawPath)
  }
}

async function runShellOpen(path: string): Promise<void> {
  // shell.openPath resolves to an empty string on success and to an error
  // message string on failure (Electron API quirk). Surface failures so the
  // renderer can show feedback instead of a silent no-op.
  const errorMessage = await shell.openPath(path)
  if (errorMessage.length > 0) {
    throw new Error(errorMessage)
  }
}
