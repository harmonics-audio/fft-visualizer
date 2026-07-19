import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, ref, nextTick, type App } from 'vue'
import FFTVisualizer from './FFTVisualizer.vue'

// --- helpers --------------------------------------------------------------

const mounted: App[] = []

async function mountViz(props: Record<string, unknown>) {
  const host = document.createElement('div')
  host.style.width = '200px'
  host.style.height = '120px'
  document.body.appendChild(host)

  const vizRef = ref<{ feedData: (d: Uint8Array) => void } | null>(null)
  const app = createApp({
    render: () => h(FFTVisualizer, { ...props, ref: vizRef })
  })
  app.mount(host)
  mounted.push(app)
  await nextTick()

  const canvas = host.querySelector('canvas') as HTMLCanvasElement
  return { canvas, viz: vizRef }
}

const raf = () => new Promise((r) => requestAnimationFrame(() => r(null)))
async function waitFrames(n = 3) {
  for (let i = 0; i < n; i++) await raf()
}

function readPixels(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl')!
  const { width: w, height: h } = canvas
  const px = new Uint8Array(w * h * 4)
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
  return { px, w, h }
}

function centerPixel(canvas: HTMLCanvasElement) {
  const { px, w, h } = readPixels(canvas)
  const i = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4
  return [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!]
}

function alphaValues(canvas: HTMLCanvasElement) {
  const { px } = readPixels(canvas)
  let min = 255
  let max = 0
  for (let i = 3; i < px.length; i += 4) {
    min = Math.min(min, px[i]!)
    max = Math.max(max, px[i]!)
  }
  return { min, max }
}

afterEach(() => {
  let app: App | undefined
  while ((app = mounted.pop())) app.unmount()
  document.body.innerHTML = ''
})

// --- tests ----------------------------------------------------------------

describe('FFTVisualizer WebGL context', () => {
  it('uses an opaque context by default', async () => {
    const { canvas } = await mountViz({ mode: 'external', showStats: false })
    await waitFrames()
    expect(canvas.getContext('webgl')!.getContextAttributes()!.alpha).toBe(false)
  })

  it('uses an alpha context when background is transparent', async () => {
    const { canvas } = await mountViz({ mode: 'external', background: 'transparent', showStats: false })
    await waitFrames()
    expect(canvas.getContext('webgl')!.getContextAttributes()!.alpha).toBe(true)
  })
})

describe('FFTVisualizer background rendering', () => {
  it('fills empty areas with the default dark background (opaque)', async () => {
    const { canvas } = await mountViz({ mode: 'external', showStats: false })
    await waitFrames()
    const [r, g, b, a] = centerPixel(canvas)
    expect(a).toBe(255)
    // Default #0a0a0a ≈ 10
    expect(r).toBeLessThan(30)
    expect(g).toBeLessThan(30)
    expect(b).toBeLessThan(30)
  })

  it('honors a custom solid background color', async () => {
    const { canvas } = await mountViz({ mode: 'external', background: '#ff0000', showStats: false })
    await waitFrames()
    const [r, g, b, a] = centerPixel(canvas)
    expect(a).toBe(255)
    expect(r).toBeGreaterThan(230)
    expect(g).toBeLessThan(30)
    expect(b).toBeLessThan(30)
  })

  it('renders a fully transparent canvas when idle and background is transparent', async () => {
    const { canvas } = await mountViz({ mode: 'external', background: 'transparent', showStats: false })
    await waitFrames()
    // No data fed → whole canvas is background → alpha 0 everywhere
    expect(alphaValues(canvas).max).toBe(0)
  })

  it('draws opaque bars over a transparent background when data is fed', async () => {
    const { canvas, viz } = await mountViz({ mode: 'external', background: 'transparent', showStats: false })
    await waitFrames()
    viz.value!.feedData(new Uint8Array(80).fill(255))
    await waitFrames()
    const { min, max } = alphaValues(canvas)
    expect(max).toBe(255) // opaque bar pixels exist
    expect(min).toBe(0)   // transparent gaps between bars still exist
  })
})
