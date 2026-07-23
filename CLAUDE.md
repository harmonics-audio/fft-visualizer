# fft-visualizer - Development Guidelines

## Git Workflow

**Never commit automatically.** Always let the user create commits themselves. Prepare changes and stage files if needed, but do not run `git commit`.

## Project Overview

This is a standalone Vue 3 component library that provides a WebGL-based FFT spectrum visualizer. It receives pre-computed FFT data via WebSocket and renders it using GPU-accelerated WebGL.

## Build Commands

```bash
pnpm install    # Install dependencies
pnpm build      # Build library (runs vue-tsc && vite build)
pnpm dev        # Development server
pnpm typecheck  # Type checking only
```

## Project Structure

```
src/
├── components/
│   └── FFTVisualizer.vue    # Main component
└── index.ts                  # Package exports

backend-examples/
├── python/                   # Python reference implementation
├── nodejs/                   # Node.js reference implementation
└── rust/                     # Rust reference implementation
```

## WebSocket Protocol

The component expects:
1. JSON config: `{"type":"config","mode":"fft","bins":80,"fps":120}`
2. Binary frames: N bytes of uint8 (0-255 frequency magnitudes)
