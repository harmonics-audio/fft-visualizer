#!/usr/bin/env bash
#
# Assembles the four playgrounds into the one static site served at
# demo.fftvisualizer.com:
#
#   playground/site/dist/
#     index.html      the switcher landing (playground/site/index.html)
#     core/ vue/ react/ nuxt/
#
# Nothing is rewritten here. Each playground already builds at the subpath it is
# served from (`base` in its vite.config.ts, `app.baseURL` for Nuxt), so the four
# trees only have to move into place.
#
# nginx.conf is *not* copied here — it belongs to the image, not the site, and the
# Dockerfile picks it up straight from playground/site/.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
site="$root/playground/site"
out="$site/dist"

pnpm --filter @fft-visualizer/playground-core build:site
pnpm --filter @fft-visualizer/playground-vue build:site
pnpm --filter @fft-visualizer/playground-react build:site
pnpm --filter @fft-visualizer/playground-nuxt build:site

rm -rf "$out"
mkdir -p "$out"

cp "$site/index.html" "$out/index.html"
cp -R "$root/playground/core/dist" "$out/core"
cp -R "$root/playground/vue/dist" "$out/vue"
cp -R "$root/playground/react/dist" "$out/react"
# Nuxt's static output is the whole of .output/public — index.html and _nuxt/
# both sit at its root, and the /nuxt/ prefix is already baked into the URLs.
cp -R "$root/playground/nuxt/.output/public" "$out/nuxt"

echo "Assembled $out"
