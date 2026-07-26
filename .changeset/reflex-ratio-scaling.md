---
"@fft-visualizer/core": patch
---

`reflexRatio` now scales the reflection instead of only shrinking the analyzer.

- **Linear (mono):** the reflection is scaled to the band `reflexRatio` reserves,
  so a full-height bar mirrors exactly down to the canvas bottom. It was
  previously fixed at half the bar height, which left the reserved band partly
  empty above `reflexRatio ≈ 0.33` — past that point the slider did nothing but
  push the analyzer upward. Values at or below ~0.35 look near-identical to
  before; higher values now produce a correspondingly deeper reflection.
- **Radial:** `reflexRatio` was read only as an on/off flag, so every value > 0
  rendered the same inner reflection. It now scales how far the mirror reaches
  inward, as a fraction of the bars' radial length (`0.5` reproduces the old
  fixed-half look, and is clipped at the centre when the inner circle is
  smaller than the mirror).

Reaches `@fft-visualizer/vue` and `@fft-visualizer/react` through the core
renderer; no API change in any package.
