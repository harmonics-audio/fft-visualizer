import { describe, it, expect, afterEach } from 'vitest'
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import FFTVisualizer, { type FFTVisualizerHandle, type FFTVisualizerProps } from './FFTVisualizer'

// --- helpers --------------------------------------------------------------

// act() only flushes effects (which is what mounts the core) when React sees a
// test environment.
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Root[] = []

async function mountViz(props: FFTVisualizerProps) {
  const host = document.createElement('div')
  host.style.width = '200px'
  host.style.height = '120px'
  document.body.appendChild(host)

  const viz = createRef<FFTVisualizerHandle>()
  const root = createRoot(host)
  mounted.push(root)
  await act(async () => { root.render(<FFTVisualizer {...props} ref={viz} />) })

  const canvas = host.querySelector('canvas') as HTMLCanvasElement
  const rerender = (next: FFTVisualizerProps) =>
    act(async () => { root.render(<FFTVisualizer {...next} ref={viz} />) })
  return { canvas, viz, rerender }
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

afterEach(async () => {
  await act(async () => {
    let root: Root | undefined
    while ((root = mounted.pop())) root.unmount()
  })
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
    viz.current!.feedData(new Uint8Array(80).fill(255))
    await waitFrames()
    const { min, max } = alphaValues(canvas)
    expect(max).toBe(255) // opaque bar pixels exist
    expect(min).toBe(0)   // transparent gaps between bars still exist
  })
})

describe('FFTVisualizer onFrame callback', () => {
  it('reports frame magnitudes when data is fed', async () => {
    const frames: Uint8Array[] = []
    const { viz } = await mountViz({
      mode: 'external',
      bands: 80,
      showStats: false,
      onFrame: (data) => frames.push(data)
    })
    await waitFrames()
    viz.current!.feedData(new Uint8Array(80).fill(255))

    expect(frames.length).toBeGreaterThan(0)
    const last = frames[frames.length - 1]!
    expect(last).toBeInstanceOf(Uint8Array)
    expect(last.length).toBe(80)
    expect(last[40]!).toBeGreaterThan(0) // fed energy shows up in the reported array
  })

  it('does not throw when data is fed without an onFrame callback', async () => {
    const { viz } = await mountViz({ mode: 'external', bands: 80, showStats: false })
    await waitFrames()
    expect(() => viz.current!.feedData(new Uint8Array(80).fill(255))).not.toThrow()
  })
})

describe('FFTVisualizer prop updates', () => {
  it('keeps the core defaults of props that are not passed', async () => {
    // A re-render must not push `undefined` for unset options: the core merges
    // its defaults once, in its constructor, so a clobbered `barSpace` (0.25 →
    // undefined) would close the gaps between the bars.
    const props: FFTVisualizerProps = { mode: 'external', background: 'transparent', showStats: false }
    const { canvas, viz, rerender } = await mountViz(props)
    await waitFrames()
    await rerender(props)
    await waitFrames()

    viz.current!.feedData(new Uint8Array(80).fill(255))
    await waitFrames()
    const { min, max } = alphaValues(canvas)
    expect(max).toBe(255) // bars still drawn
    expect(min).toBe(0)   // and the default bar spacing survived the re-render
  })

  it('forwards a changed prop to the core', async () => {
    const { canvas, rerender } = await mountViz({ mode: 'external', bands: 80, showStats: false })
    await waitFrames()
    await rerender({ mode: 'external', bands: 20, showStats: false })
    await waitFrames()
    expect(canvas.getAttribute('aria-label')).toContain('20 bands')
  })
})
