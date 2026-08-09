import { libraryVitestConfig } from '../../vitest.shared.js'

// The parser is the one package a wrong branch silently corrupts a user's mod files in, so it
// holds a higher bar than the shared default.
export default libraryVitestConfig({ branches: 85 })
