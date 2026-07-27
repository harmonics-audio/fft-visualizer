# Contributing

Thanks for taking an interest. This is a small project, so the process is light —
open an issue before starting anything large, and don't worry about ceremony for
small fixes.

## Getting set up

You need **Node 22+** and **pnpm** (the version is pinned in `packageManager`, so
`corepack enable` picks the right one automatically).

```bash
pnpm install
pnpm exec playwright install --with-deps chromium   # for the WebGL browser tests
```

The everyday commands (`pnpm dev`, `pnpm build`, `pnpm test`, …) are listed in the
[README's Development section](./README.md#development) and not repeated here.

`packages/core/wasm/pkg/` is committed, so a normal build needs **no Rust
toolchain**. You only need Rust + `wasm-pack` if you change the DSP in
`packages/core/wasm/src/`, and if you do, commit the regenerated `pkg/` alongside
your Rust changes.

## Before you open a pull request

```bash
pnpm check    # lint + typecheck + test + build — the same gates CI runs
```

CI additionally builds the playground site (`pnpm build:playground`), because the
four demo apps aren't part of `pnpm -r build`. If you touched anything under
`playground/`, run it locally too.

Branch off `main` and target `main`.

## Tests

- **`packages/core`** — plain Node tests (`vitest run`) for the pure logic:
  `pcm.test.ts`, `processing.test.ts`.
- **`packages/vue` / `packages/react`** — real-browser tests through Playwright
  Chromium, because the renderer is WebGL and jsdom cannot exercise it. They assert
  on actual pixels via `gl.readPixels`, plus context attributes and prop plumbing.

If you change rendering behaviour, add a pixel assertion rather than a snapshot of
the call sequence — the existing tests in `FFTVisualizer.browser.test.ts` show the
pattern. New visualizer options should also be reflected in the docs site (see
below).

## Changesets

Releases run on [Changesets](https://github.com/changesets/changesets). If your
change affects published behaviour, add one:

```bash
pnpm changeset
```

The three packages are on **fixed versioning** — `@fft-visualizer/core`, `/vue` and
`/react` always ship the same version number, so a changeset for one bumps all
three. Skip the changeset for docs, tests, CI, or playground-only changes.

Publishing is maintainer-only (`pnpm release`).

## Where things live

- **Library code** — this repo.
- **Documentation site** — [fftvisualizer.com](https://fftvisualizer.com) is built
  from a separate repository. Option semantics are documented once, in the shared
  Guide; the per-package pages link to it. If you add or change an option, please
  mention it in your PR so the docs can follow.
- **Live demo** — [demo.fftvisualizer.com](https://demo.fftvisualizer.com) is built
  from `playground/` in this repo.

## Reporting bugs

Rendering bugs are often GPU- or driver-specific, so please include your browser,
OS and — if you can get it — the WebGL renderer string from
`chrome://gpu` or `about:support`. Whether the same problem reproduces on
[demo.fftvisualizer.com](https://demo.fftvisualizer.com) is very useful to know.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](./LICENSE).
