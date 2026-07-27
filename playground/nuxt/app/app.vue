<script setup lang="ts">
// Nuxt playground for @fft-visualizer/vue. The control panel is the Vue
// playground's app, imported rather than copied — Nuxt changes nothing about how
// the wrapper is used, so a forked copy would exist only to drift out of parity.
//
// What Nuxt *does* change is where the component may render: the visualizer
// creates a WebGL context and an AudioContext on mount, neither of which exists
// during the prerender pass. <ClientOnly> is the whole of the Nuxt integration.
import PlaygroundApp from '@fft-visualizer/playground-vue/App.vue'
import { playgrounds, DOCS_URL, REPO_URL } from '@fft-visualizer/playground-shared/playgrounds'

useHead({ title: 'Nuxt + @fft-visualizer/vue Playground' })
</script>

<template>
  <ClientOnly>
    <PlaygroundApp title="Nuxt + @fft-visualizer/vue Playground" active="nuxt">
      <template #subtitle>
        The <code>&lt;FFTVisualizer&gt;</code> component inside
        <code>&lt;ClientOnly&gt;</code>, on a prerendered Nuxt page.
      </template>
    </PlaygroundApp>

    <!-- The prerendered HTML: the switcher and a heading, so the page isn't blank
         before hydration. The bar is repeated rather than hoisted out of
         <ClientOnly> because hydration replaces this whole subtree — leaving it
         out would shift the page down the moment the visualizer appears. -->
    <template #fallback>
      <nav class="playground-nav">
        <div class="playground-nav-inner">
          <a class="playground-nav-brand" :href="DOCS_URL">FFT Visualizer</a>
          <div class="playground-nav-links">
            <a
              v-for="p in playgrounds"
              :key="p.id"
              :href="p.href"
              :class="{ active: p.id === 'nuxt' }"
              :aria-current="p.id === 'nuxt' ? 'page' : undefined"
            >{{ p.label }}</a>
          </div>
          <a class="playground-nav-repo" :href="REPO_URL">GitHub</a>
        </div>
      </nav>

      <div class="playground">
        <header>
          <div>
            <h1>Nuxt + @fft-visualizer/vue Playground</h1>
            <div class="subtitle">Loading the visualizer…</div>
          </div>
        </header>
      </div>
    </template>
  </ClientOnly>
</template>
