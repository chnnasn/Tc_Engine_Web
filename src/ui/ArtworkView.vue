<script setup lang="ts">
import { Gamepad2 } from '@lucide/vue'

withDefaults(defineProps<{ src: string; alt: string; eager?: boolean }>(), { eager: false })
</script>

<template>
  <img v-if="src" class="artwork" :src="src" :alt="alt" :loading="eager ? 'eager' : 'lazy'" />
  <div v-else class="blank-artwork"><Gamepad2 :size="36" :stroke-width="1.25" /><span>下一个好玩的想法</span></div>
</template>
