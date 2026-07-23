// Vanilla-TS playground for fft-visualizer-core. It doubles as a live proof that
// the FFTVisualizer class drives a real spectrum with no framework — just a
// canvas, `new FFTVisualizer(...)`, and `setOptions(...)` from plain DOM events.
import { FFTVisualizer, gradientNames, type FFTVisualizerOptions } from '../src'
import { builtinPresets, type FftPresetSettings } from './presets'

// The visual settings the controls edit (data-source settings live in the
// header selector, not here — they aren't part of a preset).
const state: FftPresetSettings = {
  bands: 40,
  showPeaks: true,
  peakDecay: 0.89,
  ledBars: false,
  ledShape: 'segment',
  lumiBars: false,
  radial: false,
  radialInnerRadius: 0.35,
  barSpace: 0.25,
  reflexRatio: 0,
  reflexAlpha: 0.25,
  glow: 0,
  rotation: 0,
  gradient: 'rainbow',
  gradientDirection: 'horizontal',
  colorMode: 'gradient',
  noiseFloor: 0,
  smoothing: 0.5,
  stereo: true
}

// Data source. Empty ws URL by default so a hosted (HTTPS) demo never
// auto-connects to an insecure ws:// endpoint — enter your own wss:// server.
let mode: 'local' | 'websocket' = 'local'
let websocketUrl = ''
let audioSource: 'mic' | 'display' = 'mic'
let audioDeviceId = ''

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="playground">
    <header>
      <div>
        <h1>fft-visualizer-core Playground</h1>
        <div class="subtitle">Framework-agnostic <code>FFTVisualizer</code> class, driven by plain DOM controls.</div>
      </div>
      <div class="source-selector">
        <label>Mode</label>
        <select id="mode">
          <option value="local">Local (WASM)</option>
          <option value="websocket">WebSocket</option>
        </select>
        <select id="audioSource">
          <option value="mic">Microphone</option>
          <option value="display">System Audio</option>
        </select>
        <select id="device" class="hidden"></select>
        <input id="wsUrl" class="text-input hidden" type="text" placeholder="wss://your-server:port" />
        <button id="connect" class="connect-btn"></button>
      </div>
    </header>

    <div class="visualizer-container" id="vizContainer">
      <canvas id="viz"></canvas>
    </div>
    <button class="fullscreen-btn" id="fullscreen">⛶ Fullscreen</button>

    <div class="controls presets-row">
      <div class="control-group">
        <label>Preset</label>
        <select id="preset">
          <option value="" disabled selected>Choose a preset…</option>
        </select>
      </div>
    </div>

    <div class="controls" id="controls"></div>
  </div>
`

const canvas = app.querySelector<HTMLCanvasElement>('#viz')!
const viz = new FFTVisualizer(canvas, { ...state, mode, audioSource })

// ---- Data source selector ----
const modeSel = app.querySelector<HTMLSelectElement>('#mode')!
const audioSourceSel = app.querySelector<HTMLSelectElement>('#audioSource')!
const deviceSel = app.querySelector<HTMLSelectElement>('#device')!
const wsInput = app.querySelector<HTMLInputElement>('#wsUrl')!
const connectBtn = app.querySelector<HTMLButtonElement>('#connect')!

function refreshConnectBtn() {
  connectBtn.textContent = viz.isConnected ? 'Disconnect' : 'Connect'
  connectBtn.classList.toggle('disconnect', viz.isConnected)
}

function refreshSourceInputs() {
  audioSourceSel.classList.toggle('hidden', mode !== 'local')
  wsInput.classList.toggle('hidden', mode !== 'websocket')
  const showDevices = mode === 'local' && audioSource === 'mic' && viz.audioDevices.length > 1
  deviceSel.classList.toggle('hidden', !showDevices)
  if (showDevices) {
    deviceSel.innerHTML =
      `<option value="">Default</option>` +
      viz.audioDevices.map(d => `<option value="${d.deviceId}">${d.label || d.deviceId}</option>`).join('')
    deviceSel.value = audioDeviceId
  }
}

function applySource() {
  viz.setOptions({
    mode,
    audioSource,
    audioDeviceId: audioDeviceId || undefined,
    websocketUrl: websocketUrl || undefined
  })
}

modeSel.addEventListener('change', () => {
  mode = modeSel.value as typeof mode
  refreshSourceInputs()
  applySource()
})
audioSourceSel.addEventListener('change', () => {
  audioSource = audioSourceSel.value as typeof audioSource
  refreshSourceInputs()
  applySource()
})
deviceSel.addEventListener('change', () => {
  audioDeviceId = deviceSel.value
  applySource()
})
wsInput.addEventListener('change', () => {
  websocketUrl = wsInput.value.trim()
  applySource()
})
connectBtn.addEventListener('click', () => {
  if (viz.isConnected) viz.disconnect()
  else viz.connect()
  refreshConnectBtn()
})

// Connection state & device list can change asynchronously (permission grants,
// disconnects) — keep the header in sync.
viz.on('connected', refreshConnectBtn)
viz.on('disconnected', refreshConnectBtn)
viz.on('audiostate', refreshSourceInputs)

// ---- Visual controls ----
type Ctl =
  | { kind: 'select'; key: keyof FftPresetSettings; label: string; options: { value: string; label: string }[]; numeric?: boolean; visible?: () => boolean }
  | { kind: 'checkbox'; key: keyof FftPresetSettings; label: string; visible?: () => boolean }
  | { kind: 'range'; key: keyof FftPresetSettings; label: string; min: number; max: number; step: number; digits?: number; visible?: () => boolean }
  | { kind: 'rotate'; label: string }

const controls: Ctl[] = [
  { kind: 'select', key: 'bands', label: 'Bands', numeric: true, options: [10, 20, 40, 80].map(n => ({ value: String(n), label: String(n) })) },
  { kind: 'checkbox', key: 'ledBars', label: 'LED Bars' },
  { kind: 'select', key: 'ledShape', label: 'LED Shape', visible: () => state.ledBars, options: [{ value: 'segment', label: 'Segment' }, { value: 'meter', label: 'Meter' }] },
  { kind: 'checkbox', key: 'showPeaks', label: 'Show Peaks' },
  { kind: 'checkbox', key: 'stereo', label: 'Stereo' },
  { kind: 'checkbox', key: 'lumiBars', label: 'Lumi Bars' },
  { kind: 'checkbox', key: 'radial', label: 'Radial' },
  { kind: 'range', key: 'radialInnerRadius', label: 'Inner Radius', min: 0, max: 0.9, step: 0.05, digits: 2, visible: () => state.radial },
  { kind: 'range', key: 'barSpace', label: 'Bar Space', min: 0, max: 0.9, step: 0.05, digits: 2 },
  { kind: 'rotate', label: 'Rotate' },
  { kind: 'range', key: 'glow', label: 'Glow', min: 0, max: 1, step: 0.05, digits: 2 },
  { kind: 'range', key: 'reflexRatio', label: 'Reflex', min: 0, max: 0.7, step: 0.05, digits: 2, visible: () => state.radial || !state.stereo },
  { kind: 'range', key: 'reflexAlpha', label: 'Reflex Alpha', min: 0, max: 1, step: 0.05, digits: 2, visible: () => (state.radial || !state.stereo) && state.reflexRatio > 0 },
  { kind: 'range', key: 'noiseFloor', label: 'Noise Floor', min: 0, max: 100, step: 1 },
  { kind: 'range', key: 'smoothing', label: 'Smoothing', min: 0, max: 0.95, step: 0.05, digits: 2 },
  { kind: 'range', key: 'peakDecay', label: 'Peak Drop', min: 0.8, max: 0.999, step: 0.001, digits: 3 },
  { kind: 'select', key: 'gradient', label: 'Gradient', options: gradientNames.map(n => ({ value: n, label: n[0].toUpperCase() + n.slice(1) })) },
  { kind: 'select', key: 'gradientDirection', label: 'Direction', options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }] },
  { kind: 'select', key: 'colorMode', label: 'Color Mode', options: [{ value: 'gradient', label: 'Gradient' }, { value: 'bar-level', label: 'Bar Level' }] }
]

const controlsEl = app.querySelector<HTMLDivElement>('#controls')!
// Per-control refreshers, run after every change to sync labels + visibility + inputs.
const refreshers: (() => void)[] = []

function setOption<K extends keyof FftPresetSettings>(key: K, value: FftPresetSettings[K]) {
  state[key] = value
  viz.setOptions({ [key]: value } as Partial<FFTVisualizerOptions>)
  refreshers.forEach(fn => fn())
}

for (const ctl of controls) {
  const group = document.createElement('div')
  group.className = 'control-group'

  if (ctl.kind === 'rotate') {
    const btn = document.createElement('button')
    btn.className = 'connect-btn'
    const render = () => { btn.textContent = `Rotate (${state.rotation}°)` }
    btn.addEventListener('click', () => setOption('rotation', ((state.rotation + 90) % 360) as 0 | 90 | 180 | 270))
    render()
    refreshers.push(render)
    group.appendChild(btn)
  } else if (ctl.kind === 'checkbox') {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = state[ctl.key] as boolean
    input.addEventListener('change', () => setOption(ctl.key, input.checked as FftPresetSettings[typeof ctl.key]))
    label.append(input, document.createTextNode(' ' + ctl.label))
    refreshers.push(() => { input.checked = state[ctl.key] as boolean })
    group.appendChild(label)
  } else if (ctl.kind === 'select') {
    const label = document.createElement('label')
    label.textContent = ctl.label
    const select = document.createElement('select')
    select.innerHTML = ctl.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')
    select.value = String(state[ctl.key])
    select.addEventListener('change', () => {
      const v = ctl.numeric ? Number(select.value) : select.value
      setOption(ctl.key, v as FftPresetSettings[typeof ctl.key])
    })
    refreshers.push(() => { select.value = String(state[ctl.key]) })
    group.append(label, select)
  } else {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(ctl.min)
    input.max = String(ctl.max)
    input.step = String(ctl.step)
    input.value = String(state[ctl.key])
    const fmt = () => (ctl.digits != null ? (state[ctl.key] as number).toFixed(ctl.digits) : String(state[ctl.key]))
    const render = () => { label.textContent = `${ctl.label}: ${fmt()}` }
    input.addEventListener('input', () => setOption(ctl.key, Number(input.value) as FftPresetSettings[typeof ctl.key]))
    render()
    refreshers.push(() => { input.value = String(state[ctl.key]); render() })
    label.appendChild(input)
    group.append(label)
  }

  if (ctl.kind !== 'rotate' && ctl.visible) {
    const { visible } = ctl
    refreshers.push(() => group.classList.toggle('hidden', !visible()))
  }
  controlsEl.appendChild(group)
}

// ---- Presets ----
const presetSel = app.querySelector<HTMLSelectElement>('#preset')!
presetSel.append(...builtinPresets.map(p => new Option(p.name, p.name)))
presetSel.addEventListener('change', () => {
  const preset = builtinPresets.find(p => p.name === presetSel.value)
  if (!preset) return
  Object.assign(state, preset.settings)
  viz.setOptions({ ...preset.settings, gradient: preset.settings.gradient })
  refreshers.forEach(fn => fn())
})

// ---- Fullscreen ----
const vizContainer = app.querySelector<HTMLElement>('#vizContainer')!
const fullscreenBtn = app.querySelector<HTMLButtonElement>('#fullscreen')!
fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement === vizContainer) document.exitFullscreen()
  else vizContainer.requestFullscreen()
})
document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement === vizContainer ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'
})

refreshSourceInputs()
refreshConnectBtn()
refreshers.forEach(fn => fn())
