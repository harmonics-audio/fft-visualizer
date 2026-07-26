import { createRoot } from 'react-dom/client'
import App from './App'
import '@fft-visualizer/playground-shared/playground.css'

// No <StrictMode>: its double-invoked mount effects would build, destroy and
// rebuild the WebGL context (and re-prompt for the microphone) on every load,
// which makes the playground a poor demo of what real usage looks like.
createRoot(document.getElementById('app')!).render(<App />)
