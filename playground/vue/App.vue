<script setup lang="ts">
// Vue playground for @fft-visualizer/vue. The control panel is rendered straight
// from the shared descriptors, so this file only has to bind state — the set of
// controls, their ranges and their visibility rules live in playground/shared
// and stay identical across the core, Vue, React and Nuxt apps.
//
// The Nuxt playground renders this same component rather than a copy of it: Nuxt
// changes nothing about how the wrapper is used, only where it may render, so a
// second 250-line SFC would exist purely to drift out of parity with this one.
// The heading is a prop and the strapline a slot so it can still label itself.
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue'
import { FFTVisualizer } from '@fft-visualizer/vue'
import {
  builtinPresets,
  initialSettings,
  type FftPreset,
  type FftPresetSettings
} from '@fft-visualizer/playground-shared/presets'
import {
  visibleSections,
  formatValue,
  type Control
} from '@fft-visualizer/playground-shared/controls'
import { createRadioAudio, SOMA } from '@fft-visualizer/playground-shared/radioAudio'

withDefaults(defineProps<{ title?: string }>(), { title: '@fft-visualizer/vue Playground' })

// The visual settings the controls edit. Data-source settings live in the header
// selector below, not here — they aren't part of a preset.
const settings = reactive<FftPresetSettings>({ ...initialSettings })

// Sections come pre-filtered: controls whose `visible` predicate is false drop
// out, and a section left with nothing to show disappears entirely.
const sections = computed(() => visibleSections(settings))

function setOption<K extends keyof FftPresetSettings>(key: K, value: FftPresetSettings[K]) {
  settings[key] = value
}

// The three input handlers carry the casts the descriptors can't express: a
// Control's `key` is the whole union of setting names, so TypeScript can't know
// that a checkbox only ever addresses a boolean one.
function onCheckbox(control: Control, event: Event) {
  const { checked } = event.target as HTMLInputElement
  setOption(control.key, checked as FftPresetSettings[typeof control.key])
}

function onRange(control: Control, event: Event) {
  const { value } = event.target as HTMLInputElement
  setOption(control.key, Number(value) as FftPresetSettings[typeof control.key])
}

function onSelect(control: Extract<Control, { kind: 'select' }>, event: Event) {
  const { value } = event.target as HTMLSelectElement
  setOption(control.key, (control.numeric ? Number(value) : value) as FftPresetSettings[typeof control.key])
}

function rotate() {
  setOption('rotation', ((settings.rotation + 90) % 360) as FftPresetSettings['rotation'])
}

// ---- Presets ----
// Built-ins ship with the playground; user presets persist in localStorage.
const USER_PRESETS_KEY = 'fft-playground-user-presets'
const userPresets = ref<FftPreset[]>([])
const selectedPreset = ref('')
const presetName = ref('')

const isUserPreset = computed(() => userPresets.value.some(p => p.name === selectedPreset.value))

function persistUserPresets() {
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets.value))
}

function applyPreset(name: string) {
  const preset = userPresets.value.find(p => p.name === name) ?? builtinPresets.find(p => p.name === name)
  if (!preset) return
  Object.assign(settings, preset.settings)
  // Saving again with the name prefilled overwrites a user preset in place.
  presetName.value = isUserPreset.value ? name : ''
}

function savePreset() {
  const name = presetName.value.trim()
  if (!name) return
  const preset: FftPreset = { name, settings: { ...settings } }
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
  presetName.value = ''
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY)
    if (raw) userPresets.value = JSON.parse(raw) as FftPreset[]
  } catch { /* corrupt storage — start fresh */ }
})

// ---- Data source ----
// Empty ws URL by default so the hosted (HTTPS) demo never auto-connects to an
// insecure ws:// endpoint. Enter your own wss:// server.
//
// 'radio' is the playground's own name for the visualizer's `external` mode: the
// shared radio engine analyses a live stream and feeds frames in through the
// component's feedData, exactly as a consumer would with their own source.
const source = ref<'radio' | 'local' | 'websocket'>('radio')
const websocketUrl = ref('')
const audioSource = ref<'mic' | 'display'>('mic')
const audioDeviceId = ref('')

const vizMode = computed(() => (source.value === 'radio' ? 'external' : source.value))

const fftRef = ref<InstanceType<typeof FFTVisualizer>>()

const radio = createRadioAudio()
const radioPlaying = ref(false)

// In radio mode the visualizer is 'connected' from the moment the source is
// picked — `external` renders whatever it was last fed — so the button has to
// track the stream rather than isConnected.
const isActive = computed(() =>
  source.value === 'radio' ? radioPlaying.value : (fftRef.value?.isConnected ?? false))

function stopRadio() {
  if (!radioPlaying.value) return
  radio.stop()
  radioPlaying.value = false
}

function startRadio() {
  radioPlaying.value = true
  // Feed left/right only while Stereo is on: the core mirrors mono data across
  // both channels itself, but never derives the mono buffer from a stereo pair,
  // so the non-stereo layout would have nothing to draw.
  radio.start((mono, left, right) => {
    if (settings.stereo) fftRef.value?.feedData(mono, left, right)
    else fftRef.value?.feedData(mono)
  }).catch(() => {
    // Blocked stream or a dead proxy — drop back to a stopped button.
    radioPlaying.value = false
  })
}

function toggleConnection() {
  // The radio branch stays inside the click handler: autoplay policy only allows
  // playback to begin from a user gesture.
  if (source.value === 'radio') {
    if (radioPlaying.value) stopRadio()
    else startRadio()
  } else if (fftRef.value?.isConnected) {
    fftRef.value.disconnect()
  } else {
    fftRef.value?.connect()
  }
}

// Switching away has to stop the stream — nothing else would, and it would keep
// playing over whatever source comes next.
function onSourceChange() {
  stopRadio()
}

// Switching device mid-capture needs a reconnect to take effect.
function onDeviceChange() {
  if (fftRef.value?.isConnected && source.value === 'local') {
    fftRef.value.disconnect()
    fftRef.value.connect()
  }
}

// ---- Fullscreen ----
const vizContainer = ref<HTMLElement>()
const fullscreenEl = ref<Element | null>(null)

function toggleFullscreen() {
  const el = vizContainer.value
  if (!el) return
  if (document.fullscreenElement === el) document.exitFullscreen()
  else el.requestFullscreen()
}

function onFullscreenChange() {
  fullscreenEl.value = document.fullscreenElement
}

onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  stopRadio()
})
</script>

<template>
  <div class="playground">
    <header>
      <div>
        <h1>{{ title }}</h1>
        <div class="subtitle">
          <slot name="subtitle">
            The <code>&lt;FFTVisualizer&gt;</code> component, driven by reactive props.
          </slot>
        </div>
      </div>
      <div class="source-selector">
        <label for="mode">Mode</label>
        <select id="mode" v-model="source" @change="onSourceChange">
          <option value="radio">Radio (SomaFM)</option>
          <option value="local">Microphone (WASM)</option>
          <option value="websocket">WebSocket</option>
        </select>
        <template v-if="source === 'local'">
          <select v-model="audioSource" @change="onDeviceChange">
            <option value="mic">Microphone</option>
            <option value="display">System Audio</option>
          </select>
          <select
            v-if="audioSource === 'mic' && (fftRef?.audioDevices?.length ?? 0) > 1"
            v-model="audioDeviceId"
            @change="onDeviceChange"
          >
            <option value="">Default</option>
            <option
              v-for="device in fftRef?.audioDevices ?? []"
              :key="device.deviceId"
              :value="device.deviceId"
            >{{ device.label || device.deviceId }}</option>
          </select>
        </template>
        <input
          v-if="source === 'websocket'"
          v-model="websocketUrl"
          class="text-input"
          type="text"
          placeholder="wss://your-server:port"
        />
        <span v-if="source === 'radio'" class="radio-info">
          <a :href="SOMA.station" target="_blank" rel="noopener">{{ SOMA.name }}</a>
          on SomaFM — <a :href="SOMA.support" target="_blank" rel="noopener">support them</a>
        </span>
        <button
          class="connect-btn"
          :class="{ disconnect: isActive }"
          @click="toggleConnection"
        >{{ isActive ? 'Disconnect' : 'Connect' }}</button>
      </div>
    </header>

    <div ref="vizContainer" class="visualizer-container">
      <FFTVisualizer
        ref="fftRef"
        v-bind="settings"
        :mode="vizMode"
        :websocket-url="websocketUrl || undefined"
        :audio-source="audioSource"
        :audio-device-id="audioDeviceId || undefined"
      />
    </div>
    <button class="fullscreen-btn" @click="toggleFullscreen">
      {{ fullscreenEl === vizContainer ? '⛶ Exit Fullscreen' : '⛶ Fullscreen' }}
    </button>

    <div class="presets-row">
      <label for="preset">Preset</label>
      <select id="preset" v-model="selectedPreset" @change="applyPreset(selectedPreset)">
        <option value="" disabled>Choose a preset…</option>
        <optgroup label="Built-in">
          <option v-for="p in builtinPresets" :key="p.name" :value="p.name">{{ p.name }}</option>
        </optgroup>
        <optgroup v-if="userPresets.length" label="Saved">
          <option v-for="p in userPresets" :key="p.name" :value="p.name">{{ p.name }}</option>
        </optgroup>
      </select>
      <input v-model="presetName" class="text-input preset-name" type="text" placeholder="Save as…" />
      <button @click="savePreset">Save</button>
      <button v-if="isUserPreset" @click="deletePreset">Delete</button>
    </div>

    <div class="control-sections">
      <section v-for="section in sections" :key="section.id" class="control-section">
        <div class="control-section-title">{{ section.label }}</div>
        <div
          v-for="control in section.controls"
          :key="control.key"
          class="control-group"
          :class="control.kind"
        >
          <button v-if="control.kind === 'rotate'" @click="rotate">
            {{ control.label }} ({{ settings.rotation }}°)
          </button>
          <label v-else-if="control.kind === 'checkbox'">
            <input
              type="checkbox"
              :checked="settings[control.key] as boolean"
              @change="onCheckbox(control, $event)"
            />
            {{ control.label }}
          </label>
          <label v-else-if="control.kind === 'select'">
            <span>{{ control.label }}</span>
            <select :value="String(settings[control.key])" @change="onSelect(control, $event)">
              <option v-for="o in control.options" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label v-else>
            <span>{{ control.label }}: {{ formatValue(control, settings) }}</span>
            <input
              type="range"
              :min="control.min"
              :max="control.max"
              :step="control.step"
              :value="settings[control.key] as number"
              @input="onRange(control, $event)"
            />
          </label>
        </div>
      </section>
    </div>
  </div>
</template>
