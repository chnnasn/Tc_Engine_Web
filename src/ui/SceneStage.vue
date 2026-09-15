<script setup lang="ts">
import { Box, Gamepad2, Plus } from '@lucide/vue'
import type { Scene } from './data'
import ArtworkView from './ArtworkView.vue'

withDefaults(defineProps<{ scene: Scene; selectedId: string; grid?: boolean; preview?: boolean; zoom?: number }>(), {
  grid: false,
  preview: false,
  zoom: 100,
})
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <div class="editor-stage" :class="{ 'show-grid': grid && !preview, 'has-background': Boolean(scene.background) }" :style="{ transform: preview ? undefined : `scale(${zoom / 100})` }">
    <ArtworkView v-if="scene.background" :src="scene.background" alt="场景背景示意" eager />
    <div v-else class="stage-origin"><Plus :size="15" :stroke-width="1" /></div>
    <button v-for="object in preview ? [] : scene.objects.filter(item => item.visible && item.type === 'sprite')" :key="object.id"
      class="scene-object" :class="{ selected: selectedId === object.id, 'has-art': Boolean(scene.background) }"
      :style="{ left: `clamp(6%, calc(50% + ${object.x}px), 94%)`, top: `clamp(10%, calc(50% - ${object.y}px), 90%)`, transform: `translate(-50%, -50%) rotate(${object.rotation}deg) scale(${Math.max(.1, Math.min(object.scale, 4))})` }"
      :aria-label="`选择场景对象 ${object.name}`" @click="emit('select', object.id)">
      <span class="object-name">{{ object.name }}</span><Box v-if="!scene.background" :size="24" :stroke-width="1.5" />
      <span class="selection-handle top-left" /><span class="selection-handle top-right" /><span class="selection-handle bottom-left" /><span class="selection-handle bottom-right" />
    </button>
    <div v-if="preview" class="scene-preview-note"><Gamepad2 :size="22" /><strong>场景界面预览</strong><span>当前展示保存前的场景外观，尚未接入游戏运行时。</span></div>
  </div>
</template>
