<script setup lang="ts">
import { useNavigation } from './navigation'

withDefaults(defineProps<{ href?: string }>(), { href: '/' })
const emit = defineEmits<{ click: [event: MouseEvent] }>()
const navigate = useNavigation()

function handleClick(event: MouseEvent) {
  emit('click', event)
  const anchor = event.currentTarget as HTMLAnchorElement
  if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey &&
      !event.shiftKey && !event.altKey && (!anchor.target || anchor.target === '_self')) {
    event.preventDefault()
    navigate(anchor.getAttribute('href') || '/')
  }
}
</script>

<template>
  <a :href="href" @click="handleClick"><slot /></a>
</template>
