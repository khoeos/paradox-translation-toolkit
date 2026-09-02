import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'
import tsconfigPaths from 'vite-tsconfig-paths'

const TSCONFIG_PATHS_OPTS = { ignoreConfigErrors: true } as const

export default defineConfig({
  main: {
    plugins: [tsconfigPaths(TSCONFIG_PATHS_OPTS)],
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main')
      }
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
