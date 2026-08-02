/**
 * Launcher for the developer CLI.
 *
 * It exists to be a single `node` invocation. An npm script that chains a `.cmd` shim, and
 * `esbuild` and a nested `npm run` are both shims, makes cmd.exe caret escape every argument
 * holding a space: `--mod "Muslim Enhancements"` reaches the process as `^Muslim^ Enhancements^`
 * and silently matches nothing. Bundling through the esbuild API instead keeps the chain to
 * one process and the arguments intact.
 */

import { build } from 'esbuild'
import { pathToFileURL } from 'url'
import * as path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const outfile = path.join(root, 'out/cli/index.cjs')

await build({
  entryPoints: [path.join(root, 'src/cli/index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  logLevel: 'warning'
})

await import(pathToFileURL(outfile).href)
