/**
 * Kept as a re-export so the many `./node-fs.js` imports in `src/main` stay put; the
 * implementation lives in `@ptt/fs-node`, shared with `apps/cli`.
 */
export { nodeFs } from '@ptt/fs-node'
