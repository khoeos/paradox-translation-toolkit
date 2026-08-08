import { getAllGameIds } from '@ptt/game-registry'
import { LANGUAGE_CODES } from '@ptt/shared-types'
import { TRANSLATE_DEFAULTS, TRANSLATE_PROVIDERS } from '@ptt/translate-core'

import { DEFAULT_CONFIG_FILE } from './config.js'
import { bold, cyan } from './output.js'

/**
 * Ported from PR #4 (e21ee7a, `src/cli/index.ts` `HELP`) by Artem Kondrashev. The defaults quoted
 * here are read from the same constants the code uses, so the help cannot drift from the behaviour
 * the way the original's two copies of the defaults did (audit finding Q-5).
 */
export function help(): string {
  return `
${bold('Paradox Translation Toolkit - developer CLI')}

  ptt <command> [flags]

${bold('Commands')}
  scan       What every mod is missing, the generated mod counted as coverage
  audit      The same, key by key: which strings are still untranslated and why
  convert    Run a real conversion, optionally translating
  provider   Send one string to the configured backend and print what comes back
  memory     Size of the translation memory shared with the app, or clear it
  reports    List the run reports written by earlier conversions

${bold('Where things are')}
  Flags may live in ${cyan(DEFAULT_CONFIG_FILE)} in the current directory, so a run is just
  ${cyan('ptt audit')}. A flag on the command line always wins.

${bold('Common flags')}
  --path <dir>          Folder holding the mods (a workshop content folder, or one mod)
  --game <id>           ${getAllGameIds().join(', ')} (default ck3)
  --from <code>         Source language, default en
  --to <codes>          Target languages, comma separated, default ru
                        One of ${LANGUAGE_CODES.join(', ')}
  --mod-name <name>     Generated mod name, default "Missing Translations"
  --mod <text>          Only mods whose id or name contains this
  --limit <n>           Rows to print, default 30
  --json <file>         Write the raw result as JSON
  --csv <file>          Write the key level rows as CSV
  --documents <dir>     Override the Documents folder
  --user-data <dir>     Override the app data folder (memory, glossary, reports)
  --config <file>       Read flags from this file instead of ${DEFAULT_CONFIG_FILE}

${bold('audit flags')}
  --state <name>        own, patch, generated, kept, english, missing, or all
                        (default english: the ones a retry could still fix)

${bold('convert flags')}
  --mode <name>         mod (default), add, extract
  --out <dir>           Destination for --mode extract
  --mods <a,b,c>        Only these mod folders
  --translate           Actually translate, instead of copying the source strings
  --provider <name>     ${TRANSLATE_PROVIDERS.join(', ')} (default ${TRANSLATE_DEFAULTS.provider})
  --base-url <url>      Backend endpoint
  --model <name>        Model name
  --api-key <key>       Prefer the PTT_API_KEY environment variable: a key on the
                        command line ends up in the shell history
  --batch <n>           Strings per request, default ${TRANSLATE_DEFAULTS.batchSize}
  --concurrency <n>     Requests in flight, default ${TRANSLATE_DEFAULTS.concurrency}
  --retries <n>         Attempts before a batch is split, default ${TRANSLATE_DEFAULTS.retries}
  --timeout <ms>        Per request timeout, default ${TRANSLATE_DEFAULTS.timeout}
  --game-path <dir>     Game installation, its own localisation becomes the glossary

${bold('memory flags')}
  --clear               Forget every translation learnt so far

${bold('reports flags')}
  --last                Summarise the newest report instead of listing them

${bold('Examples')}
  ptt scan --path "D:/SteamLibrary/steamapps/workshop/content/1158310"
  ptt audit --state english --limit 50 --csv refused.csv
  ptt audit --mod "Muslim Enchantments" --state missing
  ptt convert --translate --provider rapidapi --batch 150
`
}
