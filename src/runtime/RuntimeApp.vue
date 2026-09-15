<script setup lang="ts">
import { computed } from 'vue'
import RuntimeCanvas from './RuntimeCanvas.vue'

const project = computed(() => {
  const id = new URLSearchParams(location.search).get('project')
  return window.TomCatStore?.get?.(id || '') || (id ? { id, name: id } : undefined)
})
</script>

<template>
  <div class="runtime-app">
    <RuntimeCanvas :project="project" />
  </div>
</template>

<style scoped>
.runtime-app {
  width: 100vw;
  height: 100vh;
  margin: 0;
  overflow: hidden;
  background: #202020;
}
</style>
