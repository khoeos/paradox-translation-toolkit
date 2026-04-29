import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'
import tsconfigPaths from 'vite-tsconfig-paths'

// Limit which tsconfig.json files the plugin scans. Without this, it walks the
// whole workspace and chokes on `apps/desktop/dist-deploy/tsconfig.json` (a
// stale snapshot produced by `pnpm deploy`).
const TSCONFIG_PATHS_OPTS = { ignoreConfigErrors: true } as const

// Build-time flag: true only when CI built this binary with a Windows code-signing
// certificate available. Read by `updater-service.ts` to decide whether to use
// `electron-updater` (auto-download + auto-install) or fall back to opening the
// GitHub release page in the browser. See docs/publishing.md.
const winSigned = process.env['PTT_WIN_SIGNED'] === '1'

export default defineConfig({
  main: {
    // Bundle EVERYTHING into the main process bundle. Only Electron's built-in
    // `electron` module and Node's `node:*` namespace remain external (provided
    // by the runtime). This lets us ship an empty `node_modules/` in the packed
    // app and avoids `pnpm deploy --prod` shenanigans pulling in dev deps.
    plugins: [tsconfigPaths(TSCONFIG_PATHS_OPTS)],
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main')
      }
    },
    define: {
      __WIN_SIGNED__: JSON.stringify(winSigned)
    },
    build: {
      sourcemap: false,
      externalizeDeps: false,
      rollupOptions: {
        external: ['electron', /^node:/],
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'workers/converter': resolve(__dirname, 'src/main/workers/converter.worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [tsconfigPaths(TSCONFIG_PATHS_OPTS)],
    resolve: {
      alias: {
        '@preload': resolve(__dirname, 'src/preload')
      }
    },
    build: {
      sourcemap: false,
      externalizeDeps: false,
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@main': resolve(__dirname, 'src/main'),
        '@preload': resolve(__dirname, 'src/preload')
      },
      // Force a single React copy to avoid the two-Reacts "useReducer" symptom.
      dedupe: ['react', 'react-dom']
    },
    plugins: [tsconfigPaths(TSCONFIG_PATHS_OPTS), react(), tailwindcss()],
    build: {
      sourcemap: false,
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    server: {
      port: 5173
    }
  }
})
