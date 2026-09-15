<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'

withDefaults(defineProps<{ title: string; wide?: boolean }>(), { wide: false })
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()

onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => dialog.value?.close())

function handleBackdrop(event: MouseEvent) {
  if (event.target !== event.currentTarget) return
  const box = (event.currentTarget as HTMLDialogElement).getBoundingClientRect()
  if (event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom) emit('close')
}
</script>

<template>
  <dialog ref="dialog" class="dialog" :class="{ 'dialog-wide': wide }" aria-labelledby="dialog-title"
    @cancel.prevent="emit('close')" @click="handleBackdrop">
    <div class="dialog-head">
      <h2 id="dialog-title">{{ title }}</h2>
      <button class="icon-button" aria-label="关闭对话框" @click="emit('close')"><X :size="19" /></button>
    </div>
    <slot />
  </dialog>
</template>
