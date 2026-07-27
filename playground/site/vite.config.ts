// Preview only. The site is assembled by scripts/build-playground-site.sh, not
// built by Vite — this config exists so `pnpm preview` can serve the assembled
// dist/ with the two things a plain static server cannot reproduce: the radio
// proxy, and the / → /core/ redirect that stands in for the deleted landing page.
//
// The shared plugin is imported by relative path rather than through its
// workspace specifier: playground/site holds no package.json (it is a directory
// of site assets, not a workspace package), so it has no dependency to resolve.
import { defineConfig, type Plugin } from 'vite'
import { radioDevProxy } from '../shared/radioDevProxy.ts'

// Mirrors `location = /` in playground/site/nginx.conf. Without it the assembled
// site has nothing at its root and preview 404s where production redirects.
function rootRedirect(): Plugin {
  return {
    name: 'playground-root-redirect',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/') return next()
        res.statusCode = 302
        res.setHeader('Location', '/core/')
        res.end()
      })
    }
  }
}

export default defineConfig({
  root: __dirname,
  build: { outDir: 'dist' },
  plugins: [radioDevProxy(), rootRedirect()]
})
