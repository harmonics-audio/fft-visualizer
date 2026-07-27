// The switcher bar shown at the top of every playground. Only the list lives here:
// each app renders its own markup from it, the same way controls.ts and presets.ts
// drive four identical control panels without a shared component.
//
// The hrefs are absolute, so they only resolve on the assembled site
// (scripts/build-playground-site.sh). Under a single app's dev server the other
// three 404 — switching between apps is a property of the assembled site, not of
// any one dev server.

export type PlaygroundId = 'core' | 'vue' | 'react' | 'nuxt'

export interface PlaygroundLink {
  id: PlaygroundId
  label: string
  href: string
}

export const playgrounds: PlaygroundLink[] = [
  { id: 'core', label: 'Core', href: '/core/' },
  { id: 'vue', label: 'Vue', href: '/vue/' },
  { id: 'react', label: 'React', href: '/react/' },
  { id: 'nuxt', label: 'Nuxt', href: '/nuxt/' }
]

// Carried by the bar because it is now the only chrome on the site: the landing
// page these links used to sit on is gone.
export const DOCS_URL = 'https://fftvisualizer.com'
export const REPO_URL = 'https://github.com/harmonics-audio/fft-visualizer'
