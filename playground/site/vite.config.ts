// Preview only. The site is assembled by scripts/build-playground-site.sh, not
// built by Vite — this config exists so `pnpm preview` can serve the assembled
// dist/ with the radio proxy mounted, which is the one thing a plain static
// server cannot reproduce.
//
// The shared plugin is imported by relative path rather than through its
// workspace specifier: playground/site holds no package.json (it is a directory
// of site assets, not a workspace package), so it has no dependency to resolve.
import { defineConfig } from 'vite'
import { radioDevProxy } from '../shared/radioDevProxy.ts'

export default defineConfig({
  root: __dirname,
  build: { outDir: 'dist' },
  plugins: [radioDevProxy()]
})
