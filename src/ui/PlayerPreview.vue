<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, Play } from '@lucide/vue'
import type { Game } from './data'
import AppModal from './AppModal.vue'
import ArtworkView from './ArtworkView.vue'

defineProps<{ game: Game }>()
const emit = defineEmits<{ close: [] }>()
const expanded = ref(false)
</script>

<template>
  <AppModal :title="`${game.title} · 游玩预览`" wide @close="emit('close')">
    <div class="player-preview" :class="{ 'player-expanded': expanded }">
      <ArtworkView :src="game.image" :alt="`${game.title}封面`" />
      <div class="player-preview-message"><span class="player-symbol"><Play :size="25" :stroke-width="1.5" /></span><h3>故事，即将开始</h3><p>当前仅展示播放器界面<br />尚未接入游戏运行时</p></div>
      <button class="player-expand icon-button" :aria-label="expanded ? '恢复预览比例' : '放大预览画面'" @click="expanded = !expanded"><ExternalLink :size="17" /></button>
    </div>
    <p class="local-note">这是作品播放页的静态演示。封面与作品资料均为示例内容。</p>
    <div class="dialog-actions"><button class="button button-primary" @click="emit('close')">返回作品介绍</button></div>
  </AppModal>
</template>
