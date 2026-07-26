// The radio source's server half: refetch the SomaFM stream with a non-browser
// User-Agent and hand the body back on the playground's own origin.
//
// Why a proxy at all: SomaFM hotlink-protects the stream on two signals, either
// of which alone earns a 403 — a browser User-Agent (Chrome 403s, Safari gets a
// 302 to the station page) and any Referer at all. A page controls neither of
// those on its own <audio> element, so the fetch has to happen server-side.
// (It is *not* about Range — the upstream ignores Range and answers 200 with
// `accept-ranges: none` — nor about CORS, which it allows with
// `access-control-allow-origin: *`.)
//
// This function sends no Referer because `fetch` doesn't, and overrides the
// User-Agent below. nginx has to be told both explicitly: it forwards every
// client header it isn't given a replacement for.
//
// Same-origin then comes for free, which is convenient: createMediaElementSource
// on an uncorsed cross-origin element would give a silent analyser, and we never
// have to think about it.
//
// This function is the only place the upstream URL and that User-Agent live. Its
// hosts are thin: `radioDevProxy` (the three Vite playgrounds), the Nuxt
// playground's server/api/radio.get.ts, and the deployed site's nginx.conf.

/** Path every playground requests, identical in dev and production. */
export const RADIO_PROXY_PATH = '/api/radio'

/** Keep in sync with the `proxy_pass` in playground/site/nginx.conf. */
export const RADIO_UPSTREAM_URL = 'https://ice2.somafm.com/gsclassic-128-mp3'

/**
 * Sent upstream in place of the listener's own. This is the whole reason the
 * proxy exists (see the header comment), so keep it identifiable and keep it
 * clear of `Mozilla/`, `Chrome/` and `Safari/` — those are what get blocked.
 * Mirrored by `proxy_set_header User-Agent` in playground/site/nginx.conf.
 */
export const RADIO_USER_AGENT =
  'fft-visualizer-playground/1.0 (+https://github.com/harmonics-audio/fft-visualizer)'

/**
 * Open the upstream stream. The response body is an endless stream — pipe it,
 * never buffer it. Pass an AbortSignal tied to the client connection so a
 * listener going away closes the upstream one too.
 */
export function fetchRadioStream(signal?: AbortSignal): Promise<Response> {
  return fetch(RADIO_UPSTREAM_URL, { signal, headers: { 'User-Agent': RADIO_USER_AGENT } })
}
