import { _electron as electron, expect, test as base } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

interface AppFixtures {
  userDataDir: string
  launchApp: () => Promise<ElectronApplication>
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
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'ptt-e2e-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },

  launchApp: async ({ userDataDir }, use, testInfo) => {
    const started: ElectronApplication[] = []

    await use(async () => {
      const app = await electron.launch({
        cwd: APP_ROOT,
        args: [`--user-data-dir=${userDataDir}`, '.'],
        env: { ...inheritedEnv(), PTT_E2E: '1' }
      })
      await app.context().tracing.start({ screenshots: true, snapshots: true })
      started.push(app)
      return app
    })

    const failed = testInfo.status !== testInfo.expectedStatus
    for (const [index, app] of started.entries()) {
      const path = testInfo.outputPath(started.length > 1 ? `trace-${index}.zip` : 'trace.zip')
      try {
        await app.context().tracing.stop(failed ? { path } : {})
        await app.close()
      } catch {}
    }
  },

  electronApp: async ({ launchApp }, use) => {
    await use(await launchApp())
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect }
