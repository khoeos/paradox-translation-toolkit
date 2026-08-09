/**
 * Kept as a re-export so the `./generated-mod-paths.js` imports in `src/main` stay put; the
 * implementation lives in `@ptt/converter`, shared with `apps/cli`. Only the Electron side
 * knows where Documents is, and that is what it passes in.
 */
export { resolveGeneratedMod, type GeneratedModPaths } from '@ptt/converter'
