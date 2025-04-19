import { parser } from './lang.js'
import { LRLanguage, LanguageSupport } from '@codemirror/language'
import { styleTags, tags as t } from '@lezer/highlight'

// Définir les styles pour chaque type de nœud syntaxique
const parserWithStyles = parser.configure({
  props: [
    styleTags({
      Property: t.propertyName,
      Punctuation: t.punctuation
    })
  ]
})

// Créer le langage
export const langLanguage = LRLanguage.define({
  parser: parserWithStyles,
  languageData: {
    commentTokens: { line: '#' }
  }
})

// Créer l'extension de langage à utiliser avec CodeMirror
export function lang() {
  return new LanguageSupport(langLanguage)
}
