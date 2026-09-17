import { expect, test } from './fixtures'
import { seedRunReport } from './seed'

test('lists a report that was on disk before the app started', async ({
  userDataDir,
  launchApp
}) => {
  await seedRunReport(userDataDir)
  const page = await (await launchApp()).firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.getByRole('link', { name: 'Runs' }).click()

  await expect(page.getByText('Past runs')).toBeVisible()
  await expect(page.getByText('No run matches this filter.')).toBeHidden()
  await expect(page.getByText('Stellaris').first()).toBeVisible()
})

test('says so when there is no report at all', async ({ page }) => {
  await page.getByRole('link', { name: 'Runs' }).click()

  await expect(page.getByText('Past runs')).toBeVisible()
  await expect(page.getByText('Stellaris')).toBeHidden()
})

test('opens the report the row points at', async ({ userDataDir, launchApp }) => {
  await seedRunReport(userDataDir)
  const page = await (await launchApp()).firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.getByRole('link', { name: 'Runs' }).click()
  await page.getByRole('button', { name: /Open/ }).first().click()

  await expect(page.getByText('Seeded Mod')).toBeVisible()
})
