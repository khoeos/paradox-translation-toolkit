import { nodeFetch } from '@ptt/fs-node'
import { getLanguageDisplayName } from '@ptt/shared'
import { PROBE_TEXTS, createProvider } from '@ptt/translate'

import type { Args } from '../args.js'
import type { CliOptions } from '../options.js'
import { dim, facts, green, section, yellow } from '../output.js'

const KEY_PREVIEW_CHARS = 4

export async function commandProvider(options: CliOptions, args: Args): Promise<void> {
  const config = options.translate
  if (!config) throw new Error('Pass --translate together with the provider flags')

  const sample = args.rest.length > 0 ? args.rest : PROBE_TEXTS

  const language = options.targets[0]?.language
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
    ['language', `${language} (${getLanguageDisplayName(language)})`]
  ])

  const started = Date.now()
  const provider = createProvider(config, language, nodeFetch)
  const answers = await provider.translate(
    sample,
    getLanguageDisplayName(language),
    getLanguageDisplayName(options.sourceLanguage)
  )

  section(`Answer in ${Date.now() - started} ms`)
  sample.forEach((text, index) => {
    const answer = answers[index]
    console.log(`  ${dim(text)}`)
    console.log(
      `  ${answer === undefined ? yellow('(nothing usable came back)') : green(answer)}\n`
    )
  })
}
