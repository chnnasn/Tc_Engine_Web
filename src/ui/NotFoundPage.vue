<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import AppLink from './AppLink.vue'
import EmptyState from './EmptyState.vue'
</script>

<template><main id="main-content" class="page"><EmptyState title="这个小世界还没被找到" text="页面或项目可能已被移除，回到首页继续探索吧。"><AppLink class="button button-primary" href="/">返回首页<ArrowRight :size="16" /></AppLink></EmptyState></main></template>
