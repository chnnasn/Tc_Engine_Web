<script setup lang="ts">
import { Search } from '@lucide/vue'

defineProps<{ modelValue: string; placeholder: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="search-field">
    <Search :size="17" />
    <span class="sr-only">{{ placeholder }}</span>
    <input type="search" :value="modelValue" :placeholder="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
  </label>
</template>
