# syntax=docker/dockerfile:1
#
# The playground site, served at demo.fftvisualizer.com: the core, Vue, React and
# Nuxt playgrounds under /core/, /vue/, /react/, /nuxt/, with / landing on /core/.
# Built and pushed by .github/workflows/ci.yml; Coolify pulls the image.

# --- Build stage ---
FROM node:24-slim AS build
WORKDIR /app

# Pin pnpm to match the packageManager field (corepack/nixpacks can lag behind)
RUN npm i -g pnpm@11.16.0

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm i --frozen-lockfile

# Builds the four playgrounds and assembles them into playground/site/dist.
# wasm/pkg is committed, so no Rust/wasm-pack toolchain is needed here.
RUN pnpm build:playground

# --- Runtime stage ---
# nginx-unprivileged already runs as a non-root user and listens on 8080. The
# config it ships is replaced because the site needs one thing beyond static
# files: the /api/radio proxy the playgrounds' radio source fetches.
FROM nginxinc/nginx-unprivileged:alpine
COPY playground/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/playground/site/dist /usr/share/nginx/html

EXPOSE 8080
# busybox wget (alpine) — Coolify needs an in-image HEALTHCHECK to report health.
# 127.0.0.1, not localhost: wget tries the ::1 record first and nginx's `listen 8080`
# is IPv4-only, so localhost fails with ECONNREFUSED and the container never goes healthy.
# /core/ rather than /, which is a 302: Coolify gates its proxy switchover on this
# check, so it should fetch a real page rather than rest on wget's redirect handling.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/core/ >/dev/null || exit 1
