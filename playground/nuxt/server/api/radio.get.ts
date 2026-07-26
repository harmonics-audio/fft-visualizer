// The Nuxt playground's host for the shared radio proxy — the same few lines of
// glue over `fetchRadioStream` that the Vite playgrounds get from radioDevProxy,
// and the shape a real Nuxt consumer would write.
//
// This route exists only under `nuxt dev`. The playground ships as a prerendered
// static site, so in production nginx answers /api/radio for all four playgrounds
// (see playground/site/nginx.conf).
//
// It deliberately uses no h3 response helper and returns a plain web Response,
// which both h3 majors pipe. The install has two copies: Nuxt 4.5's Nitro runs
// h3 v1, while a devtools dependency (devframe → @unhead/bundler) pulls in an h3
// v2 RC that the auto-imports and the types resolve to instead. A v2 `setHeader`
// against a v1 event reaches for `event.res.headers`, which v1 has no such thing
// as — so it throws. Same reason `createError` is avoided: a v2 H3Error lacks the
// symbol v1's responder recognises, and would surface as a 500, not a 502.
import { fetchRadioStream } from '@fft-visualizer/playground-shared/radioStream'
import type { H3Event } from 'h3'

// Stop pulling from SomaFM the moment the listener goes away — otherwise every
// abandoned tab leaves an endless upstream read running for the life of the dev
// server. Returning the body as a Response is not enough on its own: h3 v1 hands
// a web stream to `pipeTo`, and only cancels *node* streams when the socket closes.
function clientDisconnectSignal(event: H3Event): AbortSignal {
  const abort = new AbortController()
  if (event.node) event.node.res.on('close', () => abort.abort())
  else event.req.signal.addEventListener('abort', () => abort.abort())
  return abort.signal
}

// …and then end the response stream quietly when that happens. Left alone, the
// abort rejects the pipe h3 is pumping, which Nitro reports as a request error —
// a red [request error] block in the dev console every time a tab is closed.
function endQuietlyOnAbort(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch {
        // Aborted: the listener is gone, so there is no one to report this to.
        controller.close()
      }
    },
    cancel: reason => reader.cancel(reason)
  })
}

export default defineEventHandler(async (event) => {
  let upstream: Response
  try {
    upstream = await fetchRadioStream(clientDisconnectSignal(event))
  } catch {
    return new Response('SomaFM stream unavailable', { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(`SomaFM responded ${upstream.status}`, { status: 502 })
  }

  // The body is endless, so it must be piped, never awaited into memory.
  return new Response(endQuietlyOnAbort(upstream.body), {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg',
      'Cache-Control': 'no-store'
    }
  })
})
