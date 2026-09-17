import { _electron as electron, expect, test as base } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

interface AppFixtures {
  electronApp: ElectronApplication
  page: Page
}

function inheritedEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  return env
}

export const test = base.extend<AppFixtures>({
  // oxlint-disable-next-line no-empty-pattern
  electronApp: async ({}, use, testInfo) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ptt-e2e-'))
    const app = await electron.launch({
      cwd: APP_ROOT,
      args: [`--user-data-dir=${userDataDir}`, '.'],
      env: { ...inheritedEnv(), PTT_E2E: '1' }
    })
    await app.context().tracing.start({ screenshots: true, snapshots: true })

    await use(app)

    const failed = testInfo.status !== testInfo.expectedStatus
    await app.context().tracing.stop(failed ? { path: testInfo.outputPath('trace.zip') } : {})
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect }
