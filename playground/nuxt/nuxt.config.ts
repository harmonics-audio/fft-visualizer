import { resolve } from 'path'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineNuxtConfig({

  compatibilityDate: '2026-07-26',
  
  // Prerendered to plain files and served from the switcher site's /nuxt/ subpath,
  // so every asset URL Nuxt emits has to carry that prefix.
  //
  // Production only, and deliberately so: Nitro mounts *every* route under
  // baseURL (`h3App.use(config.app.baseURL, router.handler)`), which in dev would
  // move the radio proxy to /nuxt/api/radio while the client asks for
  // /api/radio. Dev serves from the root, where that path lands as intended; the
  // prefix only matters for the static build, which has no server routes at all.
  $production: { app: { baseURL: '/nuxt/' } },

  css: ['@fft-visualizer/playground-shared/playground.css'],

  // `nuxt generate` crawls the links in the rendered HTML, and the switcher bar
  // points at /core/, /vue/ and /react/ — sibling apps on the assembled site, but
  // to the crawler they look like unvisited routes of *this* app, so it prerendered
  // a copy of the Nuxt playground at /nuxt/core/ and friends. There is exactly one
  // page here (app/app.vue, no pages/), so there is nothing legitimate to crawl.
  nitro: { prerender: { crawlLinks: false, routes: ['/'] } },

  alias: {
    // Deliberately overrides the workspace links, which would resolve both
    // packages to their `dist` bundles: the playground then needs no prior
    // `pnpm build`, and edits to the wrapper or the engine show up on save.
    // The import specifiers stay the published ones, so the code still reads
    // as real usage.
    //
    // The subpath comes first: alias keys match by prefix, so the bare entry
    // alone would rewrite '@fft-visualizer/core/wasm' to 'src/index.ts/wasm'.
    '@fft-visualizer/core/wasm': resolve(__dirname, '../../packages/core/src/wasm.ts'),
    '@fft-visualizer/vue': resolve(__dirname, '../../packages/vue/src/index.ts'),
    '@fft-visualizer/core': resolve(__dirname, '../../packages/core/src/index.ts')
  },

  // Those aliases point at raw TS/SFC sources rather than built bundles, and the
  // two playground workspaces are raw sources as well — Nitro has to compile
  // them into the server build instead of externalizing them as prebuilt deps.
  build: {
    transpile: [
      '@fft-visualizer/vue',
      '@fft-visualizer/core',
      '@fft-visualizer/playground-vue',
      '@fft-visualizer/playground-shared'
    ]
  },

  vite: {
    plugins: [wasm(), topLevelAwait()],
    build: {
      // The WASM glue emits top-level await; esnext keeps
      // vite-plugin-top-level-await clear of esbuild's down-level pass.
      target: 'esnext'
    }
  }
})
