<script setup lang="ts">
import { Search } from '@lucide/vue'

defineProps<{ title: string; text: string }>()
</script>

<template>
  <div class="empty-state">
    <Search :size="28" :stroke-width="1.4" />
    <h3>{{ title }}</h3>
    <p>{{ text }}</p>
    <slot />
  </div>
</template>
