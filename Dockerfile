# syntax=docker/dockerfile:1
#
# The Vue playground, served as a static site at demo.fftvisualizer.com.
# Built and pushed by .github/workflows/ci.yml; Coolify pulls the image.

# --- Build stage ---
FROM node:24-slim AS build
WORKDIR /app

# Pin pnpm to match the packageManager field (corepack/nixpacks can lag behind)
RUN npm i -g pnpm@11.16.0

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm i --frozen-lockfile

# Builds fft-visualizer-core, then the Vue playground into packages/vue/dist.
# wasm/pkg is committed, so no Rust/wasm-pack toolchain is needed here.
RUN pnpm build:playground

# --- Runtime stage ---
# nginx-unprivileged already runs as a non-root user and listens on 8080, so
# there is nothing to configure — the playground is plain static files (the WASM
# FFT is base64-inlined into the JS bundle, so no extra MIME types either).
FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /app/packages/vue/dist /usr/share/nginx/html

EXPOSE 8080
# busybox wget (alpine) — Coolify needs an in-image HEALTHCHECK to report health.
# 127.0.0.1, not localhost: wget tries the ::1 record first and nginx's `listen 8080`
# is IPv4-only, so localhost fails with ECONNREFUSED and the container never goes healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
