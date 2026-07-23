import { ref, type Ref } from 'vue'
import { createLocalAudio, type LocalAudioOptions, type AudioDevice, type AudioSourceType } from 'fft-visualizer-core'

export type { LocalAudioOptions, AudioDevice, AudioSourceType }

export interface LocalAudioReturn {
  /** Reactive FFT magnitude data (0-255 per bin) */
  fftData: Ref<Uint8Array>
  /** Whether local audio capture is active */
  isActive: Ref<boolean>
  /** Current audio source type */
  sourceType: Ref<AudioSourceType>
  /** Available audio input devices (populated after getDevices or start) */
  devices: Ref<AudioDevice[]>
  /** Currently active device ID */
  activeDeviceId: Ref<string | undefined>
  /** Enumerate available audio input devices (requests mic permission if needed) */
  getDevices: () => Promise<AudioDevice[]>
  /** Start audio capture from microphone */
  start: (deviceId?: string) => Promise<void>
  /** Start audio capture from system/tab audio via screen sharing */
  startDisplay: () => Promise<void>
  /** Stop audio capture */
  stop: () => void
}

/**
 * Vue wrapper around the framework-agnostic {@link createLocalAudio} engine —
 * mirrors its state into refs via the engine's onData/onStateChange callbacks.
 */
export function useLocalAudio(options?: LocalAudioOptions): LocalAudioReturn {
  const fftData = ref<Uint8Array>(new Uint8Array(options?.bins ?? 80))
  const isActive = ref(false)
  const sourceType = ref<AudioSourceType>('mic')
  const devices = ref<AudioDevice[]>([])
  const activeDeviceId = ref<string | undefined>(options?.deviceId)

  const engine = createLocalAudio({
    ...options,
    onData: (data) => { fftData.value = data },
    onStateChange: () => {
      isActive.value = engine.isActive
      sourceType.value = engine.sourceType
      devices.value = engine.devices
      activeDeviceId.value = engine.activeDeviceId
    }
  })

  return {
    fftData,
    isActive,
    sourceType,
    devices,
    activeDeviceId,
    getDevices: engine.getDevices,
    start: engine.start,
    startDisplay: engine.startDisplay,
    stop: engine.stop
  }
}
