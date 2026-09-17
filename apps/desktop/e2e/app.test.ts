import { expect, test } from './fixtures'

const GAME_TABS_IN_REGISTRY_ORDER = [
  'Stellaris',
  'Europa Universalis IV',
  'Europa Universalis V',
  'Hearts of Iron IV',
  'Crusader Kings III',
  'Victoria 3',
  'Imperator: Rome'
]

test('opens a single main window', async ({ electronApp, page }) => {
  await expect(page).toHaveTitle('Paradox Translation Toolkit')
  expect(electronApp.windows()).toHaveLength(1)

  const isVisible = await electronApp.evaluate(({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows()
    return win?.isVisible() ?? false
  })
  expect(isVisible).toBe(true)
})

test('renders the game tabs in registry order', async ({ page }) => {
  const tabs = page.getByRole('button', { name: new RegExp(GAME_TABS_IN_REGISTRY_ORDER[0] ?? '') })
  await expect(tabs.first()).toBeVisible()

  const labels = await page.locator('button').allInnerTexts()
  const gameLabels = labels.filter(label => GAME_TABS_IN_REGISTRY_ORDER.includes(label))
  expect(gameLabels).toEqual(GAME_TABS_IN_REGISTRY_ORDER)
})

test('selecting a game reveals the converter form', async ({ page }) => {
  await expect(page.getByText('Mod folder', { exact: true })).toBeHidden()

  await page.getByRole('button', { name: 'Stellaris', exact: true }).click()

  await expect(page.getByText('Mod folder', { exact: true })).toBeVisible()
  await expect(page.getByText('Mode', { exact: true })).toBeVisible()
})

test('navigates to the run history', async ({ page }) => {
  await page.getByRole('link', { name: 'Runs' }).click()

  await expect(page.getByRole('link', { name: 'Converter' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stellaris', exact: true })).toBeHidden()
})
