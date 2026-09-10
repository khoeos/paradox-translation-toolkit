/// <reference types="vite/client" />

// Injected at build time by electron.vite.config.ts (`define`) from apps/desktop/package.json.
// eslint-disable-next-line no-underscore-dangle
declare const __PTT_VERSION__: string

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
