// Vanilla-TS playground for @fft-visualizer/core. It doubles as a live proof
// that the FFTVisualizer class drives a real spectrum with no framework — just a
// canvas, `new FFTVisualizer(...)`, and `setOptions(...)` from plain DOM events.
import { FFTVisualizer, type FFTVisualizerOptions } from '@fft-visualizer/core'
import {
  builtinPresets,
  initialSettings,
  type FftPreset,
  type FftPresetSettings
} from '@fft-visualizer/playground-shared/presets'
import {
  controlSections,
  formatValue,
  type Control
} from '@fft-visualizer/playground-shared/controls'
import { createRadioAudio, SOMA } from '@fft-visualizer/playground-shared/radioAudio'
import '@fft-visualizer/playground-shared/playground.css'

// The visual settings the controls edit. Data-source settings live in the header
// selector below, not here — they aren't part of a preset.
const state: FftPresetSettings = { ...initialSettings }

// Data source. Empty ws URL by default so a hosted (HTTPS) demo never
// auto-connects to an insecure ws:// endpoint — enter your own wss:// server.
//
// 'radio' is the playground's own name for the visualizer's `external` mode: the
// shared radio engine analyses a live stream and feeds frames in through
// feedData, exactly as a consumer would with their own source. It is the default
// because it needs neither a microphone permission prompt nor a server — the
// visitor only has to press Connect (autoplay policy requires the gesture).
let source: 'radio' | 'local' | 'websocket' = 'radio'
let websocketUrl = ''
let audioSource: 'mic' | 'display' = 'mic'
let audioDeviceId = ''

const radio = createRadioAudio()
let radioPlaying = false

const vizMode = () => (source === 'radio' ? 'external' : source)

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="playground">
    <header>
      <div>
        <h1>@fft-visualizer/core Playground</h1>
        <div class="subtitle">Framework-agnostic <code>FFTVisualizer</code> class, driven by plain DOM controls.</div>
      </div>
      <div class="source-selector">
        <label>Mode</label>
        <select id="mode">
          <option value="radio">Radio (SomaFM)</option>
          <option value="local">Microphone (WASM)</option>
          <option value="websocket">WebSocket</option>
        </select>
        <select id="audioSource" class="hidden">
          <option value="mic">Microphone</option>
          <option value="display">System Audio</option>
        </select>
        <select id="device" class="hidden"></select>
        <input id="wsUrl" class="text-input hidden" type="text" placeholder="wss://your-server:port" />
        <span id="radioInfo" class="radio-info">
          <a href="${SOMA.station}" target="_blank" rel="noopener">${SOMA.name}</a>
          on SomaFM — <a href="${SOMA.support}" target="_blank" rel="noopener">support them</a>
        </span>
        <button id="connect" class="connect-btn"></button>
      </div>
    </header>

    <div class="visualizer-container" id="vizContainer">
      <canvas id="viz"></canvas>
    </div>
    <button class="fullscreen-btn" id="fullscreen">⛶ Fullscreen</button>

    <div class="presets-row">
      <label for="preset">Preset</label>
      <select id="preset"></select>
      <input id="presetName" class="text-input preset-name" type="text" placeholder="Save as…" />
      <button id="savePreset">Save</button>
      <button id="deletePreset" class="hidden">Delete</button>
    </div>

    <div class="control-sections" id="sections"></div>
  </div>
`

const canvas = app.querySelector<HTMLCanvasElement>('#viz')!
const viz = new FFTVisualizer(canvas, { ...state, mode: vizMode(), audioSource })

// ---- Data source selector ----
const modeSel = app.querySelector<HTMLSelectElement>('#mode')!
const audioSourceSel = app.querySelector<HTMLSelectElement>('#audioSource')!
const deviceSel = app.querySelector<HTMLSelectElement>('#device')!
const wsInput = app.querySelector<HTMLInputElement>('#wsUrl')!
const radioInfo = app.querySelector<HTMLSpanElement>('#radioInfo')!
const connectBtn = app.querySelector<HTMLButtonElement>('#connect')!

function stopRadio() {
  if (!radioPlaying) return
  radio.stop()
  radioPlaying = false
}

function startRadio() {
  radioPlaying = true
  // Feed left/right only while Stereo is on: the core mirrors mono data across
  // both channels itself, but never derives the mono buffer from a stereo pair,
  // so the non-stereo layout would have nothing to draw.
  radio.start((mono, left, right) => {
    if (state.stereo) viz.feedData(mono, left, right)
    else viz.feedData(mono)
  }).catch(() => {
    // Blocked stream or a dead proxy — drop back to a stopped button.
    radioPlaying = false
    refreshConnectBtn()
  })
}

// In radio mode the visualizer is 'connected' from the moment the source is
// picked — `external` renders whatever it was last fed — so the button has to
// track the stream rather than viz.isConnected.
function refreshConnectBtn() {
  const active = source === 'radio' ? radioPlaying : viz.isConnected
  connectBtn.textContent = active ? 'Disconnect' : 'Connect'
  connectBtn.classList.toggle('disconnect', active)
}

function refreshSourceInputs() {
  audioSourceSel.classList.toggle('hidden', source !== 'local')
  wsInput.classList.toggle('hidden', source !== 'websocket')
  radioInfo.classList.toggle('hidden', source !== 'radio')
  const showDevices = source === 'local' && audioSource === 'mic' && viz.audioDevices.length > 1
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
    mode: vizMode(),
    audioSource,
    audioDeviceId: audioDeviceId || undefined,
    websocketUrl: websocketUrl || undefined
  })
}

modeSel.addEventListener('change', () => {
  // Switching away has to stop the stream — nothing else would, and it would keep
  // playing over whatever source comes next.
  stopRadio()
  source = modeSel.value as typeof source
  refreshSourceInputs()
  applySource()
  refreshConnectBtn()
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
  // The radio branch stays inside the click handler: autoplay policy only allows
  // playback to begin from a user gesture.
  if (source === 'radio') {
    if (radioPlaying) stopRadio()
    else startRadio()
  } else if (viz.isConnected) {
    viz.disconnect()
  } else {
    viz.connect()
  }
  refreshConnectBtn()
})

// Connection state & device list can change asynchronously (permission grants,
// disconnects) — keep the header in sync.
viz.on('connected', refreshConnectBtn)
viz.on('disconnected', refreshConnectBtn)
viz.on('audiostate', refreshSourceInputs)

// ---- Visual controls ----
// Every control is built once and then kept in sync by a refresher, rather than
// re-rendered from `visibleSections()` on each change: rebuilding the DOM would
// drop the slider you are currently dragging.
const sectionsEl = app.querySelector<HTMLDivElement>('#sections')!
const refreshers: (() => void)[] = []

function setOption<K extends keyof FftPresetSettings>(key: K, value: FftPresetSettings[K]) {
  state[key] = value
  viz.setOptions({ [key]: value } as Partial<FFTVisualizerOptions>)
  refreshers.forEach(fn => fn())
}

function createControl(control: Control): HTMLElement {
  const group = document.createElement('div')
  group.className = `control-group ${control.kind}`

  if (control.kind === 'rotate') {
    const button = document.createElement('button')
    const render = () => { button.textContent = `${control.label} (${state.rotation}°)` }
    button.addEventListener('click', () =>
      setOption('rotation', ((state.rotation + 90) % 360) as FftPresetSettings['rotation']))
    render()
    refreshers.push(render)
    group.appendChild(button)
  } else if (control.kind === 'checkbox') {
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    const render = () => { input.checked = state[control.key] as boolean }
    input.addEventListener('change', () =>
      setOption(control.key, input.checked as FftPresetSettings[typeof control.key]))
    render()
    refreshers.push(render)
    label.append(input, document.createTextNode(` ${control.label}`))
    group.appendChild(label)
  } else if (control.kind === 'select') {
    const label = document.createElement('label')
    const text = document.createElement('span')
    text.textContent = control.label
    const select = document.createElement('select')
    select.innerHTML = control.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')
    const render = () => { select.value = String(state[control.key]) }
    select.addEventListener('change', () =>
      setOption(control.key, (control.numeric ? Number(select.value) : select.value) as FftPresetSettings[typeof control.key]))
    render()
    refreshers.push(render)
    label.append(text, select)
    group.appendChild(label)
  } else {
    const label = document.createElement('label')
    // The label text is its own <span> so refreshing it can't wipe the slider
    // that shares the <label> — writing to label.textContent would.
    const text = document.createElement('span')
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(control.min)
    input.max = String(control.max)
    input.step = String(control.step)
    const render = () => {
      text.textContent = `${control.label}: ${formatValue(control, state)}`
      input.value = String(state[control.key])
    }
    input.addEventListener('input', () =>
      setOption(control.key, Number(input.value) as FftPresetSettings[typeof control.key]))
    render()
    refreshers.push(render)
    label.append(text, input)
    group.appendChild(label)
  }

  if (control.visible) {
    const { visible } = control
    refreshers.push(() => group.classList.toggle('hidden', !visible(state)))
  }
  return group
}

for (const section of controlSections) {
  const sectionEl = document.createElement('section')
  sectionEl.className = 'control-section'

  const title = document.createElement('div')
  title.className = 'control-section-title'
  title.textContent = section.label
  sectionEl.appendChild(title)

  const groups = section.controls.map(control => {
    const group = createControl(control)
    sectionEl.appendChild(group)
    return group
  })

  // A section whose every control is hidden should disappear rather than leave
  // an empty box — Reflection does exactly that in the default stereo,
  // non-radial state. Pushed after the controls' own refreshers so it reads
  // their freshly applied visibility.
  refreshers.push(() =>
    sectionEl.classList.toggle('hidden', groups.every(g => g.classList.contains('hidden'))))

  sectionsEl.appendChild(sectionEl)
}

// ---- Presets ----
// Built-ins ship with the playground; user presets persist in localStorage.
const USER_PRESETS_KEY = 'fft-playground-user-presets'
let userPresets: FftPreset[] = []
try {
  const raw = localStorage.getItem(USER_PRESETS_KEY)
  if (raw) userPresets = JSON.parse(raw) as FftPreset[]
} catch { /* corrupt storage — start fresh */ }

const presetSel = app.querySelector<HTMLSelectElement>('#preset')!
const presetNameInput = app.querySelector<HTMLInputElement>('#presetName')!
const saveBtn = app.querySelector<HTMLButtonElement>('#savePreset')!
const deleteBtn = app.querySelector<HTMLButtonElement>('#deletePreset')!

function isUserPreset(name: string) {
  return userPresets.some(p => p.name === name)
}

function persistUserPresets() {
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets))
}

function renderPresetOptions() {
  const optgroup = (label: string, presets: FftPreset[]) =>
    `<optgroup label="${label}">` +
    presets.map(p => `<option value="${p.name}">${p.name}</option>`).join('') +
    `</optgroup>`

  const selected = presetSel.value
  presetSel.innerHTML =
    `<option value="" disabled>Choose a preset…</option>` +
    optgroup('Built-in', builtinPresets) +
    (userPresets.length ? optgroup('Saved', userPresets) : '')
  presetSel.value = selected
  deleteBtn.classList.toggle('hidden', !isUserPreset(selected))
}

presetSel.addEventListener('change', () => {
  const preset = userPresets.find(p => p.name === presetSel.value)
    ?? builtinPresets.find(p => p.name === presetSel.value)
  if (!preset) return
  Object.assign(state, preset.settings)
  viz.setOptions(preset.settings)
  refreshers.forEach(fn => fn())
  // Saving again with the name prefilled overwrites a user preset in place.
  presetNameInput.value = isUserPreset(presetSel.value) ? presetSel.value : ''
  deleteBtn.classList.toggle('hidden', !isUserPreset(presetSel.value))
})

saveBtn.addEventListener('click', () => {
  const name = presetNameInput.value.trim()
  if (!name) {
    presetNameInput.focus()
    return
  }
  const preset: FftPreset = { name, settings: { ...state } }
  const existing = userPresets.findIndex(p => p.name === name)
  if (existing >= 0) userPresets[existing] = preset
  else userPresets.push(preset)
  persistUserPresets()
  renderPresetOptions()
  presetSel.value = name
  deleteBtn.classList.remove('hidden')
})

deleteBtn.addEventListener('click', () => {
  userPresets = userPresets.filter(p => p.name !== presetSel.value)
  persistUserPresets()
  presetNameInput.value = ''
  renderPresetOptions()
  presetSel.value = ''
  deleteBtn.classList.add('hidden')
})

// ---- Fullscreen ----
const vizContainer = app.querySelector<HTMLElement>('#vizContainer')!
const fullscreenBtn = app.querySelector<HTMLButtonElement>('#fullscreen')!
fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement === vizContainer) document.exitFullscreen()
  else vizContainer.requestFullscreen()
})
document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement === vizContainer
    ? '⛶ Exit Fullscreen'
    : '⛶ Fullscreen'
})

renderPresetOptions()
refreshSourceInputs()
refreshConnectBtn()
refreshers.forEach(fn => fn())
