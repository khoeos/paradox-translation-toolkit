import { expect, test } from './fixtures'

test('keeps the UI language across a restart', async ({ launchApp }) => {
  const first = await launchApp()
  const firstPage = await first.firstWindow()
  await firstPage.waitForLoadState('domcontentloaded')
  await expect(firstPage.getByRole('link', { name: 'Converter' })).toBeVisible()

  await firstPage.getByLabel('UI language').click()
  await firstPage.getByRole('option', { name: 'Français' }).click()
  await expect(firstPage.getByRole('link', { name: 'Convertisseur' })).toBeVisible()
  await first.close()

  const second = await launchApp()
  const secondPage = await second.firstWindow()
  await secondPage.waitForLoadState('domcontentloaded')
  await expect(secondPage.getByRole('link', { name: 'Convertisseur' })).toBeVisible()
  await expect(secondPage.getByRole('link', { name: 'Converter' })).toBeHidden()
})
