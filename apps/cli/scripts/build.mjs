import { build } from 'esbuild'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Bundle the CLI once, rather than on every invocation.
 *
 * The original `scripts/ptt.mjs` rebuilt on each call: it existed to work around cmd.exe
 * re-escaping carets in arguments with spaces, by keeping everything in one node process. A real
 * `bin` entry plus a bundle built by `pnpm --filter @ptt/cli build` gets the same result without
 * paying esbuild every time. esbuild is a declared devDependency here rather than a transitive
 * resolution through vite, which the PR #4 audit flagged as an environment trap.
 */
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

await mkdir(join(root, 'dist'), { recursive: true })
await build({
  entryPoints: [join(root, 'src/index.ts')],
  outfile: join(root, 'dist/ptt.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning'
})

const launcher = `#!/usr/bin/env node
import { main } from '../dist/ptt.mjs'
await main()
`
await mkdir(join(root, 'bin'), { recursive: true })
await writeFile(join(root, 'bin/ptt.mjs'), launcher, 'utf8')
await chmod(join(root, 'bin/ptt.mjs'), 0o755)
console.log('built dist/ptt.mjs and bin/ptt.mjs')
