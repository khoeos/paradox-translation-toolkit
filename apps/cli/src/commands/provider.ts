import { nodeFetch } from '@ptt/fs-node'
import { LANGUAGE_DISPLAY_NAMES, createProvider } from '@ptt/translate'

import type { Args } from '../args.js'
import type { CliOptions } from '../options.js'
import { dim, facts, green, section, yellow } from '../output.js'

/**
 * Prove the backend answers before spending a night on a collection.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/index.ts` `commandProvider`) by Artem Kondrashev. The default
 * sample carries markup on purpose: an answer that looks fine but lost the `£gold£` is the failure
 * this command exists to surface.
 */

const DEFAULT_SAMPLE = ['Colony Ship', 'Gain £gold£ and $VALUE$ prestige']
const KEY_PREVIEW_CHARS = 4

export async function commandProvider(options: CliOptions, args: Args): Promise<void> {
  const config = options.translate
  if (!config) throw new Error('Pass --translate together with the provider flags')

  const sample = args.rest.length > 0 ? args.rest : DEFAULT_SAMPLE
  const language = options.targetLanguages[0]
  if (language === undefined) throw new Error('--to must name a language')

  facts([
    ['provider', config.provider],
    ['endpoint', config.baseUrl],
    ['model', config.model || dim('picked by the service')],
    [
      'api key',
      config.apiKey
        ? `${config.apiKey.slice(0, KEY_PREVIEW_CHARS)}… (${config.apiKey.length} chars)`
        : dim('none')
    ],
    ['language', `${language} (${LANGUAGE_DISPLAY_NAMES[language]})`]
  ])

  const started = Date.now()
  const provider = createProvider(config, language, nodeFetch)
  const answers = await provider.translate(sample, LANGUAGE_DISPLAY_NAMES[language])

  section(`Answer in ${Date.now() - started} ms`)
  sample.forEach((text, index) => {
    const answer = answers[index]
    console.log(`  ${dim(text)}`)
    console.log(
      `  ${answer === undefined ? yellow('(nothing usable came back)') : green(answer)}\n`
    )
  })
}
