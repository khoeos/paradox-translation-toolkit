# Adding a new UI language

Single source of truth: [`packages/i18n`](../packages/i18n).

## Steps

1. Add the new locale code to the `locales` array in `packages/i18n/i18next.config.ts`, then run:

   ```bash
   pnpm --filter @ptt/i18n run extract
   ```

   `i18next-cli` will scaffold `packages/i18n/src/locales/<code>.json` with the full key tree (and the locale's CLDR plural variants) populated with empty values.

2. Wire the new code into `packages/i18n/src/index.ts`:
   - import the JSON (`import xx from './locales/xx.json' with { type: 'json' }`),
   - append it to `VALID_UI_LANGUAGES`,
   - register it in the `resources` object,
   - add an entry to `UI_LANGUAGES` with its display label.
3. Add the locale code to `electronLanguages:` in `apps/desktop/electron-builder.yml` so the installer ships translated strings for the OS shell integration.
4. Translate the empty values in the new JSON file.

The Zod schema in the desktop's settings procedure pulls directly from `VALID_UI_LANGUAGES`, so the language picker in Settings updates automatically once step 2 is done, no further wiring needed.

## Verifying the translation

```bash
pnpm --filter @ptt/i18n test
```

The smoke test (`packages/i18n/test/smoke.test.ts`) asserts that every non-plural key present in English exists in every other locale. CLDR-plural-suffixed keys (`_one`, `_other`, etc.) are excluded from the parity check because not every locale uses every form (Chinese has only `_other`, English has `_one`/`_other`, French has `_one`/`_many`/`_other`, etc.).

## Filling new keys with `i18next-cli`

When new `t('foo.bar')` calls land in the codebase, run:

```bash
pnpm --filter @ptt/i18n run extract
```

This appends any missing keys to the locale JSONs with empty values (existing translations are preserved, see `i18next.config.ts`). Translators then fill them in.

CI runs the same extraction with `--ci` (`pnpm --filter @ptt/i18n run extract:check`); a PR adding a new key without updating the JSONs fails the build.

## Plurals

i18next-cli auto-detects `t(key, { count })` and emits the full set of CLDR plural variants for each locale (`key_one`, `key_other`, plus `key_many` for French, `key_few`/`key_many` for Polish, etc.). Fill **all** the variants present in the target locale's CLDR rules, not just the base key, otherwise lookups for that count category resolve to an empty string and the UI silently shows nothing.
