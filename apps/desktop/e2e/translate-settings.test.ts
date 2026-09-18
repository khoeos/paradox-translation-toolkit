import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

const PERSIST_FLUSH_MS = 900
const LM_STUDIO = 'http://localhost:1234/v1'

const openConverter = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Stellaris', exact: true }).click()
  await expect(page.getByText('Mod folder', { exact: true })).toBeVisible()
}

const enableTranslation = async (page: Page): Promise<void> => {
  const label = page.getByText('MACHINE TRANSLATION (experimental)')
  await label.scrollIntoViewIfNeeded()
  await label.click()
  await expect(page.locator('#translate-base-url')).toBeVisible()
}



test('keeps the backend configuration across a restart', async ({ launchApp }) => {
  const first = await launchApp()
  const firstPage = await first.firstWindow()
  await firstPage.waitForLoadState('domcontentloaded')
  await openConverter(firstPage)

  await enableTranslation(firstPage)
  await firstPage.getByRole('button', { name: 'OpenAI-compatible' }).click()
  await firstPage.locator('#translate-base-url').fill(LM_STUDIO)
  await firstPage.locator('#translate-model').fill('qwen3-8b')

  await firstPage.waitForTimeout(PERSIST_FLUSH_MS)
  await first.close()

  const second = await launchApp()
  const secondPage = await second.firstWindow()
  await secondPage.waitForLoadState('domcontentloaded')

  await expect(secondPage.locator('#translate-base-url')).toHaveValue(LM_STUDIO)
  await expect(secondPage.locator('#translate-model')).toHaveValue('qwen3-8b')
})

test('gives each backend its own endpoint', async ({ launchApp }) => {
  const app = await launchApp()
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await openConverter(page)

  await enableTranslation(page)
  await page.getByRole('button', { name: 'OpenAI-compatible' }).click()
  await page.locator('#translate-base-url').fill(LM_STUDIO)

  await page.getByRole('button', { name: 'Ollama' }).click()
  await expect(page.locator('#translate-base-url')).not.toHaveValue(LM_STUDIO)

  await page.getByRole('button', { name: 'OpenAI-compatible' }).click()
  await expect(page.locator('#translate-base-url')).toHaveValue(LM_STUDIO)
})
