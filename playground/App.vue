<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { FFTVisualizer, gradientNames, type GradientName } from '../src'

// FFT Visualizer Controls
const bands = ref<10 | 20 | 40 | 80>(40)
const ledBars = ref(false)
const showPeaks = ref(true)
const noiseFloor = ref(0)
const smoothing = ref(0.5)
const peakDecay = ref(0.89)
const gradient = ref<GradientName>('rainbow')
const gradientDirection = ref<'vertical' | 'horizontal'>('horizontal')
const stereo = ref(true)
const lumiBars = ref(false)
const radial = ref(false)
const radialInnerRadius = ref(0.35)
const barSpace = ref(0.25)
const reflexRatio = ref(0)
const reflexAlpha = ref(0.25)

// Mode & WebSocket URL
const mode = ref<'websocket' | 'local'>('local')
const wsUrl = ref('ws://10.0.2.213:3002')
const wsOptions = ['ws://10.0.2.213:3002', 'ws://127.0.0.1:3001']

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
          <select v-model="wsUrl">
            <option v-for="url in wsOptions" :key="url" :value="url">{{ url }}</option>
          </select>
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
        :show-peaks="showPeaks"
        :noise-floor="noiseFloor"
        :smoothing="smoothing"
        :peak-decay="peakDecay"
        :gradient="gradient"
        :gradient-direction="gradientDirection"
        :stereo="stereo"
        :lumi-bars="lumiBars"
        :radial="radial"
        :radial-inner-radius="radialInnerRadius"
        :bar-space="barSpace"
        :reflex-ratio="reflexRatio"
        :reflex-alpha="reflexAlpha"
      />
    </div>
    <button class="fullscreen-btn" @click="toggleFullscreen(fftContainer)">
      <svg v-if="fullscreenEl !== fftContainer" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6m10-10h-6V4m0 6l7-7M3 21l7-7"/></svg>
      {{ fullscreenEl === fftContainer ? 'Exit Fullscreen' : 'Fullscreen' }}
    </button>

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

      <div class="control-group" v-if="!radial && !stereo">
        <label>Reflex: {{ reflexRatio.toFixed(2) }}</label>
        <input type="range" v-model.number="reflexRatio" min="0" max="0.7" step="0.05" />
      </div>

      <div class="control-group" v-if="!radial && !stereo && reflexRatio > 0">
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

select, .connect-btn {
  background: #222;
  color: #eee;
  border: 1px solid #444;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
}

select:hover, .connect-btn:hover {
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
