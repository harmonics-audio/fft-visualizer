// Vite host for the radio stream proxy: mounts RADIO_PROXY_PATH on the dev and
// preview servers so the three Vite playgrounds answer the same URL the deployed
// site's nginx does. The Nuxt playground has its own host (a Nitro route) because
// `nuxt dev` never goes through a plain Vite server.
import type { Plugin } from 'vite'
// Explicit .ts extension, unlike the other shared modules: this one is imported
// by the playgrounds' vite.config.ts, which Vite loads through Node rather than
// through its own bundler — and Node's ESM resolver requires the extension.
import { RADIO_PROXY_PATH, fetchRadioStream } from './radioStream.ts'

// Deliberately no node:stream — the repo installs no @types/node, and the web
// reader loop below is the same handful of lines with explicit backpressure.
type ProxyResponse = {
  statusCode: number
  setHeader: (name: string, value: string) => void
  write: (chunk: Uint8Array) => boolean
  once: (event: string, listener: () => void) => void
  on: (event: string, listener: () => void) => void
  end: (body?: string) => void
  headersSent: boolean
}

async function streamRadio(res: ProxyResponse) {
  // Stop pulling from SomaFM the moment the listener goes away.
  const abort = new AbortController()
  res.on('close', () => abort.abort())

  let upstream: Response
  try {
    upstream = await fetchRadioStream(abort.signal)
  } catch {
    if (!res.headersSent) {
      res.statusCode = 502
      res.end('SomaFM stream unavailable')
    }
    return
  }

  if (!upstream.ok || !upstream.body) {
    res.statusCode = 502
    res.end(`SomaFM responded ${upstream.status}`)
    return
  }

  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'audio/mpeg')
  res.setHeader('Cache-Control', 'no-store')

  const reader = upstream.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // write() returns false once the socket buffer is full; waiting for 'drain'
      // is what keeps an endless stream from growing memory without bound.
      if (!res.write(value)) await new Promise<void>(resolve => res.once('drain', resolve))
    }
  } catch {
    // Aborted because the listener disconnected — nothing left to send.
  }
  res.end()
}

export function radioDevProxy(): Plugin {
  const mount = (middlewares: { use: (path: string, handler: (req: unknown, res: ProxyResponse) => void) => void }) => {
    middlewares.use(RADIO_PROXY_PATH, (_req, res) => void streamRadio(res))
  }

  return {
    name: 'fft-playground-radio-proxy',
    configureServer: server => mount(server.middlewares),
    configurePreviewServer: server => mount(server.middlewares)
  }
}
