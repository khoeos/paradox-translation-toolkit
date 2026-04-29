// Usage from packages/i18n:
//   pnpm run extract        append missing keys to the locale JSONs
//   pnpm run extract:check  fail if extraction would change anything (CI gate)

import { defineConfig } from 'i18next-cli'

export default defineConfig({
  locales: ['en', 'fr', 'zh'],
  extract: {
    input: ['src/**/*.{ts,tsx}', '../../apps/desktop/src/renderer/src/**/*.{ts,tsx}'],
    output: 'src/locales/{{language}}.json',

    defaultNS: false,
    nsSeparator: false,
    keySeparator: '.',
    pluralSeparator: '_',
    contextSeparator: '_',

    primaryLanguage: 'en',
    sort: true,
    indentation: 2,
    defaultValue: '',
    removeUnusedKeys: false
  }
})
