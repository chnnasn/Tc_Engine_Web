<script setup lang="ts">
import { ArrowUpRight } from '@lucide/vue'
import AppLink from './AppLink.vue'

defineProps<{ href: string }>()
</script>

<template><AppLink :href="href" class="text-link"><slot /><ArrowUpRight :size="16" /></AppLink></template>
