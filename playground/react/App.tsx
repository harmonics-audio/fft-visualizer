// React playground for @fft-visualizer/react. The control panel is rendered
// straight from the shared descriptors, so this file only has to bind state —
// the set of controls, their ranges and their visibility rules live in
// playground/shared and stay identical across the core, Vue, React and Nuxt apps.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FFTVisualizer, type AudioDevice, type FFTVisualizerHandle } from '@fft-visualizer/react'
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
import { createRadioAudio, SOMA, type RadioAudio } from '@fft-visualizer/playground-shared/radioAudio'
import { playgrounds, DOCS_URL, REPO_URL } from '@fft-visualizer/playground-shared/playgrounds'

const USER_PRESETS_KEY = 'fft-playground-user-presets'

function loadUserPresets(): FftPreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY)
    return raw ? (JSON.parse(raw) as FftPreset[]) : []
  } catch {
    return [] // corrupt storage — start fresh
  }
}

export default function App() {
  // The visual settings the controls edit. Data-source settings live in the
  // header selector below, not here — they aren't part of a preset.
  const [settings, setSettings] = useState<FftPresetSettings>(initialSettings)

  // Sections come pre-filtered: controls whose `visible` predicate is false drop
  // out, and a section left with nothing to show disappears entirely.
  const sections = useMemo(() => visibleSections(settings), [settings])

  function setOption<K extends keyof FftPresetSettings>(key: K, value: FftPresetSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }) as FftPresetSettings)
  }

  // ---- Presets ----
  // Built-ins ship with the playground; user presets persist in localStorage.
  const [userPresets, setUserPresets] = useState<FftPreset[]>(loadUserPresets)
  const [selectedPreset, setSelectedPreset] = useState('')
  const [presetName, setPresetName] = useState('')

  const isUserPreset = userPresets.some(p => p.name === selectedPreset)

  function persistUserPresets(presets: FftPreset[]) {
    setUserPresets(presets)
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets))
  }

  function applyPreset(name: string) {
    setSelectedPreset(name)
    const preset = userPresets.find(p => p.name === name) ?? builtinPresets.find(p => p.name === name)
    if (!preset) return
    setSettings(preset.settings)
    // Saving again with the name prefilled overwrites a user preset in place.
    setPresetName(userPresets.some(p => p.name === name) ? name : '')
  }

  function savePreset() {
    const name = presetName.trim()
    if (!name) return
    const preset: FftPreset = { name, settings: { ...settings } }
    const existing = userPresets.findIndex(p => p.name === name)
    persistUserPresets(existing >= 0
      ? userPresets.map((p, i) => (i === existing ? preset : p))
      : [...userPresets, preset])
    setSelectedPreset(name)
  }

  function deletePreset() {
    if (!isUserPreset) return
    persistUserPresets(userPresets.filter(p => p.name !== selectedPreset))
    setSelectedPreset('')
    setPresetName('')
  }

  // ---- Data source ----
  // Empty ws URL by default so the hosted (HTTPS) demo never auto-connects to an
  // insecure ws:// endpoint. Enter your own wss:// server.
  //
  // 'radio' is the playground's own name for the visualizer's `external` mode: the
  // shared radio engine analyses a live stream and feeds frames in through the
  // component's feedData, exactly as a consumer would with their own source.
  const [source, setSource] = useState<'radio' | 'local' | 'websocket'>('radio')
  const [websocketUrl, setWebsocketUrl] = useState('')
  const [audioSource, setAudioSource] = useState<'mic' | 'display'>('mic')
  const [audioDeviceId, setAudioDeviceId] = useState('')

  const vizMode = source === 'radio' ? 'external' : source

  const fftRef = useRef<FFTVisualizerHandle>(null)

  // The handle exposes isConnected as a plain getter, so unlike the Vue wrapper's
  // reactive ref it can't drive a re-render — mirror it into state via the events.
  const [isConnected, setIsConnected] = useState(false)

  // Same story for the device list: the wrapper doesn't surface the core's
  // `audiostate` event, so pull the devices once capture has started (which is
  // also when the mic permission that populates their labels has been granted).
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  useEffect(() => {
    if (!isConnected || source !== 'local') return
    void fftRef.current?.getAudioDevices().then(setAudioDevices).catch(() => { /* permission denied */ })
  }, [isConnected, source])

  // ---- Radio ----
  // Lazy ref rather than state: the engine is a stable object for the lifetime of
  // the app, and re-creating it per render would leak an AudioContext per click.
  const radioRef = useRef<RadioAudio | null>(null)
  radioRef.current ??= createRadioAudio()
  const [radioPlaying, setRadioPlaying] = useState(false)

  // The frame callback outlives the render that installed it, so it has to read
  // `stereo` from a ref — a captured value would freeze at whatever it was when
  // playback started and stop matching the layout on screen.
  const stereoRef = useRef(settings.stereo)
  useEffect(() => { stereoRef.current = settings.stereo }, [settings.stereo])

  // In radio mode the visualizer is 'connected' from the moment the source is
  // picked — `external` renders whatever it was last fed — so the button has to
  // track the stream rather than isConnected.
  const isActive = source === 'radio' ? radioPlaying : isConnected

  function stopRadio() {
    radioRef.current?.stop()
    setRadioPlaying(false)
  }

  function startRadio() {
    setRadioPlaying(true)
    // Feed left/right only while Stereo is on: the core mirrors mono data across
    // both channels itself, but never derives the mono buffer from a stereo pair,
    // so the non-stereo layout would have nothing to draw.
    radioRef.current?.start((mono, left, right) => {
      if (stereoRef.current) fftRef.current?.feedData(mono, left, right)
      else fftRef.current?.feedData(mono)
    }).catch(() => {
      // Blocked stream or a dead proxy — drop back to a stopped button.
      setRadioPlaying(false)
    })
  }

  // Leaving the page has to stop the stream; nothing else would.
  useEffect(() => () => radioRef.current?.stop(), [])

  function toggleConnection() {
    // The radio branch stays inside the click handler: autoplay policy only allows
    // playback to begin from a user gesture.
    if (source === 'radio') {
      if (radioPlaying) stopRadio()
      else startRadio()
    } else if (isConnected) {
      fftRef.current?.disconnect()
    } else {
      fftRef.current?.connect()
    }
  }

  // Switching source or device mid-capture needs a reconnect to take effect.
  // Done as an effect keyed on the two options rather than inside the change
  // handlers, because a setState hasn't reached the core yet at that point —
  // React flushes the wrapper's own option-forwarding effect first (child before
  // parent), so by the time this runs the core already has the new value.
  useEffect(() => {
    if (!isConnected || source !== 'local') return
    fftRef.current?.disconnect()
    fftRef.current?.connect()
    // isConnected/source are deliberately read but not tracked: a reconnect should
    // follow a source change only, not the connect that one itself triggers.
  }, [audioSource, audioDeviceId])

  // ---- Fullscreen ----
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFullscreen() {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement === el) void document.exitFullscreen()
    else void el.requestFullscreen()
  }

  // The casts here are the ones the descriptors can't express: a Control's `key`
  // is the whole union of setting names, so TypeScript can't know that a checkbox
  // only ever addresses a boolean one.
  function renderControl(control: Control): ReactNode {
    if (control.kind === 'rotate') {
      return (
        <button onClick={() => setOption('rotation', ((settings.rotation + 90) % 360) as FftPresetSettings['rotation'])}>
          {control.label} ({settings.rotation}°)
        </button>
      )
    }
    if (control.kind === 'checkbox') {
      return (
        <label>
          <input
            type="checkbox"
            checked={settings[control.key] as boolean}
            onChange={e => setOption(control.key, e.target.checked as FftPresetSettings[typeof control.key])}
          />
          {control.label}
        </label>
      )
    }
    if (control.kind === 'select') {
      return (
        <label>
          <span>{control.label}</span>
          <select
            value={String(settings[control.key])}
            onChange={e => setOption(
              control.key,
              (control.numeric ? Number(e.target.value) : e.target.value) as FftPresetSettings[typeof control.key]
            )}
          >
            {control.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )
    }
    return (
      <label>
        <span>{control.label}: {formatValue(control, settings)}</span>
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={settings[control.key] as number}
          onChange={e => setOption(control.key, Number(e.target.value) as FftPresetSettings[typeof control.key])}
        />
      </label>
    )
  }

  return (
    <>
      <nav className="playground-nav">
        <div className="playground-nav-inner">
          <a className="playground-nav-brand" href={DOCS_URL}>FFT Visualizer</a>
          <div className="playground-nav-links">
            {playgrounds.map(p => (
              <a
                key={p.id}
                href={p.href}
                className={p.id === 'react' ? 'active' : undefined}
                aria-current={p.id === 'react' ? 'page' : undefined}
              >
                {p.label}
              </a>
            ))}
          </div>
          <a className="playground-nav-repo" href={REPO_URL}>GitHub</a>
        </div>
      </nav>

      <div className="playground">
        <header>
          <div>
            <h1>@fft-visualizer/react Playground</h1>
            <div className="subtitle">
              The <code>&lt;FFTVisualizer&gt;</code> component, driven by React state.
            </div>
          </div>
          <div className="source-selector">
            <label htmlFor="mode">Mode</label>
            <select
              id="mode"
              value={source}
              onChange={e => {
                // Switching away has to stop the stream, or it keeps playing over
                // whatever source comes next.
                stopRadio()
                setSource(e.target.value as 'websocket' | 'local' | 'radio')
              }}
            >
              <option value="radio">Radio (SomaFM)</option>
              <option value="local">Microphone (WASM)</option>
              <option value="websocket">WebSocket</option>
            </select>
            {source === 'local' && (
              <>
                <select
                  value={audioSource}
                  onChange={e => setAudioSource(e.target.value as 'mic' | 'display')}
                >
                  <option value="mic">Microphone</option>
                  <option value="display">System Audio</option>
                </select>
                {audioSource === 'mic' && audioDevices.length > 1 && (
                  <select
                    value={audioDeviceId}
                    onChange={e => setAudioDeviceId(e.target.value)}
                  >
                    <option value="">Default</option>
                    {audioDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || device.deviceId}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            {source === 'websocket' && (
              <input
                className="text-input"
                type="text"
                placeholder="wss://your-server:port"
                value={websocketUrl}
                onChange={e => setWebsocketUrl(e.target.value)}
              />
            )}
            {source === 'radio' && (
              <span className="radio-info">
                <a href={SOMA.station} target="_blank" rel="noopener">{SOMA.name}</a>
                {' '}on SomaFM — <a href={SOMA.support} target="_blank" rel="noopener">support them</a>
              </span>
            )}
            <button
              className={isActive ? 'connect-btn disconnect' : 'connect-btn'}
              onClick={toggleConnection}
            >{isActive ? 'Disconnect' : 'Connect'}</button>
          </div>
        </header>

        <div ref={containerRef} className="visualizer-container">
          <FFTVisualizer
            ref={fftRef}
            {...settings}
            mode={vizMode}
            websocketUrl={websocketUrl || undefined}
            audioSource={audioSource}
            audioDeviceId={audioDeviceId || undefined}
            onConnected={() => setIsConnected(true)}
            onDisconnected={() => setIsConnected(false)}
          />
        </div>
        <button className="fullscreen-btn" onClick={toggleFullscreen}>
          {isFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'}
        </button>

        <div className="presets-row">
          <label htmlFor="preset">Preset</label>
          <select id="preset" value={selectedPreset} onChange={e => applyPreset(e.target.value)}>
            <option value="" disabled>Choose a preset…</option>
            <optgroup label="Built-in">
              {builtinPresets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </optgroup>
            {userPresets.length > 0 && (
              <optgroup label="Saved">
                {userPresets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </optgroup>
            )}
          </select>
          <input
            className="text-input preset-name"
            type="text"
            placeholder="Save as…"
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
          />
          <button onClick={savePreset}>Save</button>
          {isUserPreset && <button onClick={deletePreset}>Delete</button>}
        </div>

        <div className="control-sections">
          {sections.map(section => (
            <section key={section.id} className="control-section">
              <div className="control-section-title">{section.label}</div>
              {section.controls.map(control => (
                <div key={control.key} className={`control-group ${control.kind}`}>
                  {renderControl(control)}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
