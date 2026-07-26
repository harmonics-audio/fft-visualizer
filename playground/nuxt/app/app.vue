<script setup lang="ts">
// Nuxt playground for @fft-visualizer/vue. The control panel is the Vue
// playground's app, imported rather than copied — Nuxt changes nothing about how
// the wrapper is used, so a forked copy would exist only to drift out of parity.
//
// What Nuxt *does* change is where the component may render: the visualizer
// creates a WebGL context and an AudioContext on mount, neither of which exists
// during the prerender pass. <ClientOnly> is the whole of the Nuxt integration.
import PlaygroundApp from '@fft-visualizer/playground-vue/App.vue'

useHead({ title: 'Nuxt + @fft-visualizer/vue Playground' })
</script>

<template>
  <ClientOnly>
    <PlaygroundApp title="Nuxt + @fft-visualizer/vue Playground">
      <template #subtitle>
        The <code>&lt;FFTVisualizer&gt;</code> component inside
        <code>&lt;ClientOnly&gt;</code>, on a prerendered Nuxt page.
      </template>
    </PlaygroundApp>

    <!-- The prerendered HTML: a heading, so the page isn't blank before hydration. -->
    <template #fallback>
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
