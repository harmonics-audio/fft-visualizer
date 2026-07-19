<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { FFTVisualizer, gradientNames, type GradientName } from '../src'
import { builtinPresets, type FftPreset, type FftPresetSettings } from './presets'

// FFT Visualizer Controls
const bands = ref<10 | 20 | 40 | 80>(40)
const ledBars = ref(false)
const ledShape = ref<'segment' | 'meter'>('segment')
const showPeaks = ref(true)
const noiseFloor = ref(0)
const smoothing = ref(0.5)
const peakDecay = ref(0.89)
const gradient = ref<GradientName>('rainbow')
const gradientDirection = ref<'vertical' | 'horizontal'>('horizontal')
const colorMode = ref<'gradient' | 'bar-level'>('gradient')
const stereo = ref(true)
const lumiBars = ref(false)
const radial = ref(false)
const radialInnerRadius = ref(0.35)
const barSpace = ref(0.25)
const reflexRatio = ref(0)
const reflexAlpha = ref(0.25)
const glow = ref(0)
const rotation = ref<0 | 90 | 180 | 270>(0)

function rotate() {
  rotation.value = ((rotation.value + 90) % 360) as 0 | 90 | 180 | 270
}

// Presets: built-ins ship with the playground; user presets persist in localStorage
const USER_PRESETS_KEY = 'fft-playground-user-presets'
const userPresets = ref<FftPreset[]>([])
const selectedPreset = ref('')

const isUserPreset = computed(() => userPresets.value.some(p => p.name === selectedPreset.value))

function persistUserPresets() {
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets.value))
}

function currentSettings(): FftPresetSettings {
  return {
    bands: bands.value,
    showPeaks: showPeaks.value,
    peakDecay: peakDecay.value,
    ledBars: ledBars.value,
    ledShape: ledShape.value,
    lumiBars: lumiBars.value,
    radial: radial.value,
    radialInnerRadius: radialInnerRadius.value,
    barSpace: barSpace.value,
    reflexRatio: reflexRatio.value,
    reflexAlpha: reflexAlpha.value,
    glow: glow.value,
    rotation: rotation.value,
    gradient: gradient.value,
    gradientDirection: gradientDirection.value,
    colorMode: colorMode.value,
    noiseFloor: noiseFloor.value,
    smoothing: smoothing.value,
    stereo: stereo.value
  }
}

function applyPreset(name: string) {
  const preset = userPresets.value.find(p => p.name === name) ?? builtinPresets.find(p => p.name === name)
  if (!preset) return
  const s = preset.settings
  bands.value = s.bands
  showPeaks.value = s.showPeaks
  peakDecay.value = s.peakDecay
  ledBars.value = s.ledBars
  ledShape.value = s.ledShape ?? 'segment'
  lumiBars.value = s.lumiBars
  radial.value = s.radial
  radialInnerRadius.value = s.radialInnerRadius
  barSpace.value = s.barSpace
  reflexRatio.value = s.reflexRatio
  reflexAlpha.value = s.reflexAlpha
  glow.value = s.glow
  rotation.value = s.rotation
  gradient.value = s.gradient as GradientName
  gradientDirection.value = s.gradientDirection
  colorMode.value = s.colorMode
  noiseFloor.value = s.noiseFloor
  smoothing.value = s.smoothing
  stereo.value = s.stereo
}

function savePreset() {
  const name = window.prompt('Preset name', isUserPreset.value ? selectedPreset.value : '')?.trim()
  if (!name) return
  const preset: FftPreset = { name, settings: currentSettings() }
  const existing = userPresets.value.findIndex(p => p.name === name)
  if (existing >= 0) userPresets.value[existing] = preset
  else userPresets.value.push(preset)
  persistUserPresets()
  selectedPreset.value = name
}

function deletePreset() {
  if (!isUserPreset.value) return
  userPresets.value = userPresets.value.filter(p => p.name !== selectedPreset.value)
  persistUserPresets()
  selectedPreset.value = ''
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY)
    if (raw) userPresets.value = JSON.parse(raw)
  } catch { /* corrupt storage — start fresh */ }
})

// Mode & WebSocket URL. Empty by default so the hosted (HTTPS) demo never
// auto-connects to an insecure ws:// endpoint. Enter your own wss:// server.
const mode = ref<'websocket' | 'local'>('local')
const wsUrl = ref('')

// Audio source & device selection
const audioSource = ref<'mic' | 'display'>('mic')
const selectedDeviceId = ref<string>('')

// Component refs
const fftRef = ref<InstanceType<typeof FFTVisualizer>>()

// Fullscreen
const fftContainer = ref<HTMLElement>()
const fullscreenEl = ref<Element | null>(null)

function toggleFullscreen(el: HTMLElement | undefined) {
  if (!el) return
  if (document.fullscreenElement === el) {
    document.exitFullscreen()
  } else {
    el.requestFullscreen()
  }
}

function onFullscreenChange() {
  fullscreenEl.value = document.fullscreenElement
}

onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

async function toggleConnection() {
  if (fftRef.value?.isConnected) {
    fftRef.value?.disconnect()
  } else {
    fftRef.value?.connect()
  }
}

async function onDeviceChange() {
  if (fftRef.value?.isConnected && mode.value === 'local') {
    fftRef.value.disconnect()
    fftRef.value.connect()
  }
}
</script>

<template>
  <div class="playground">
    <header>
      <h1>FFT Visualizer Playground</h1>
      <div class="source-selector">
        <label>Mode</label>
        <select v-model="mode">
          <option value="local">Local (WASM)</option>
          <option value="websocket">WebSocket</option>
        </select>
        <template v-if="mode === 'local'">
          <select v-model="audioSource" @change="onDeviceChange">
            <option value="mic">Microphone</option>
            <option value="display">System Audio</option>
          </select>
          <select
            v-if="audioSource === 'mic' && fftRef?.audioDevices?.length > 1"
            v-model="selectedDeviceId"
            @change="onDeviceChange"
          >
            <option value="">Default</option>
            <option
              v-for="device in fftRef.audioDevices"
              :key="device.deviceId"
              :value="device.deviceId"
            >{{ device.label }}</option>
          </select>
        </template>
        <template v-if="mode === 'websocket'">
          <input
            v-model="wsUrl"
            type="text"
            class="ws-input"
            placeholder="wss://your-server:port"
          />
        </template>
        <button
          class="connect-btn"
          :class="{ 'disconnect-btn': fftRef?.isConnected }"
          @click="toggleConnection"
        >{{ fftRef?.isConnected ? 'Disconnect' : 'Connect' }}</button>
      </div>
    </header>

    <div ref="fftContainer" class="visualizer-container">
      <FFTVisualizer
        ref="fftRef"
        :mode="mode"
        :websocket-url="wsUrl"
        :audio-source="audioSource"
        :audio-device-id="selectedDeviceId || undefined"
        :bands="bands"
        :led-bars="ledBars"
        :led-shape="ledShape"
        :show-peaks="showPeaks"
        :noise-floor="noiseFloor"
        :smoothing="smoothing"
        :peak-decay="peakDecay"
        :gradient="gradient"
        :gradient-direction="gradientDirection"
        :color-mode="colorMode"
        :stereo="stereo"
        :lumi-bars="lumiBars"
        :radial="radial"
        :radial-inner-radius="radialInnerRadius"
        :bar-space="barSpace"
        :reflex-ratio="reflexRatio"
        :reflex-alpha="reflexAlpha"
        :glow="glow"
        :rotation="rotation"
      />
    </div>
    <button class="fullscreen-btn" @click="toggleFullscreen(fftContainer)">
      <svg v-if="fullscreenEl !== fftContainer" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6m10-10h-6V4m0 6l7-7M3 21l7-7"/></svg>
      {{ fullscreenEl === fftContainer ? 'Exit Fullscreen' : 'Fullscreen' }}
    </button>

    <div class="controls presets-row">
      <div class="control-group">
        <label>Preset</label>
        <select v-model="selectedPreset" @change="applyPreset(selectedPreset)">
          <option value="" disabled>Choose a preset…</option>
          <optgroup label="Built-in">
            <option v-for="p in builtinPresets" :key="p.name" :value="p.name">{{ p.name }}</option>
          </optgroup>
          <optgroup v-if="userPresets.length" label="Saved">
            <option v-for="p in userPresets" :key="p.name" :value="p.name">{{ p.name }}</option>
          </optgroup>
        </select>
        <button class="preset-btn" @click="savePreset">Save…</button>
        <button v-if="isUserPreset" class="preset-btn" @click="deletePreset">Delete</button>
      </div>
    </div>

    <div class="controls">
      <div class="control-group">
        <label>Bands</label>
        <select v-model="bands">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="40">40</option>
          <option :value="80">80</option>
        </select>
      </div>

      <div class="control-group">
        <label>
          <input type="checkbox" v-model="ledBars" />
          LED Bars
        </label>
      </div>

      <div v-if="ledBars" class="control-group">
        <label>LED Shape</label>
        <select v-model="ledShape">
          <option value="segment">Segment</option>
          <option value="meter">Meter</option>
        </select>
      </div>

      <div class="control-group">
        <label>
          <input type="checkbox" v-model="showPeaks" />
          Show Peaks
        </label>
      </div>

      <div class="control-group">
        <label>
          <input type="checkbox" v-model="stereo" />
          Stereo
        </label>
      </div>

      <div class="control-group">
        <label>
          <input type="checkbox" v-model="lumiBars" />
          Lumi Bars
        </label>
      </div>

      <div class="control-group">
        <label>
          <input type="checkbox" v-model="radial" />
          Radial
        </label>
      </div>

      <div class="control-group" v-if="radial">
        <label>Inner Radius: {{ radialInnerRadius.toFixed(2) }}</label>
        <input type="range" v-model.number="radialInnerRadius" min="0" max="0.9" step="0.05" />
      </div>

      <div class="control-group">
        <label>Bar Space: {{ barSpace.toFixed(2) }}</label>
        <input type="range" v-model.number="barSpace" min="0" max="0.9" step="0.05" />
      </div>

      <div class="control-group">
        <button class="connect-btn" @click="rotate">Rotate ({{ rotation }}°)</button>
      </div>

      <div class="control-group">
        <label>Glow: {{ glow.toFixed(2) }}</label>
        <input type="range" v-model.number="glow" min="0" max="1" step="0.05" />
      </div>

      <div class="control-group" v-if="radial || !stereo">
        <label>Reflex: {{ reflexRatio.toFixed(2) }}</label>
        <input type="range" v-model.number="reflexRatio" min="0" max="0.7" step="0.05" />
      </div>

      <div class="control-group" v-if="(radial || !stereo) && reflexRatio > 0">
        <label>Reflex Alpha: {{ reflexAlpha.toFixed(2) }}</label>
        <input type="range" v-model.number="reflexAlpha" min="0" max="1" step="0.05" />
      </div>

      <div class="control-group">
        <label>Noise Floor: {{ noiseFloor }}</label>
        <input type="range" v-model.number="noiseFloor" min="0" max="100" />
      </div>

      <div class="control-group">
        <label>Smoothing: {{ smoothing.toFixed(2) }}</label>
        <input type="range" v-model.number="smoothing" min="0" max="0.95" step="0.05" />
      </div>

      <div class="control-group">
        <label>Peak Drop: {{ peakDecay.toFixed(3) }}</label>
        <input type="range" v-model.number="peakDecay" min="0.8" max="0.999" step="0.001" />
      </div>

      <div class="control-group">
        <label>Gradient</label>
        <select v-model="gradient">
          <option v-for="name in gradientNames" :key="name" :value="name">
            {{ name.charAt(0).toUpperCase() + name.slice(1) }}
          </option>
        </select>
      </div>

      <div class="control-group">
        <label>Direction</label>
        <select v-model="gradientDirection">
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select>
      </div>

      <div class="control-group">
        <label>Color Mode</label>
        <select v-model="colorMode">
          <option value="gradient">Gradient</option>
          <option value="bar-level">Bar Level</option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playground {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

header {
  margin-bottom: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.source-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.visualizer-container {
  height: 300px;
  margin-bottom: 0.5rem;
  border-radius: 8px;
  overflow: hidden;
}

.visualizer-container:fullscreen {
  height: 100%;
  border-radius: 0;
}

.controls {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}

.presets-row {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #333;
}

.preset-btn {
  background: #222;
  color: #eee;
  border: 1px solid #444;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
}

.preset-btn:hover {
  border-color: #666;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.control-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

select, .ws-input, .connect-btn {
  background: #222;
  color: #eee;
  border: 1px solid #444;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
}

.ws-input {
  cursor: text;
  min-width: 16rem;
}

select:hover, .ws-input:hover, .connect-btn:hover {
  border-color: #666;
}

.connect-btn {
  background: #1a5c2a;
  border-color: #2a8c3a;
  padding: 0.5rem 1rem;
  font-weight: 600;
}

.connect-btn:hover {
  background: #238636;
}

.disconnect-btn {
  background: #6b2020;
  border-color: #a03030;
}

.disconnect-btn:hover {
  background: #8b3030;
}

.fullscreen-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  color: #888;
  border: none;
  padding: 0.25rem 0;
  margin-bottom: 1rem;
  font-size: 0.75rem;
  font-family: monospace;
  cursor: pointer;
}

.fullscreen-btn:hover {
  color: #eee;
}

input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

input[type="range"] {
  width: 120px;
  cursor: pointer;
}
</style>
