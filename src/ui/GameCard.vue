<script setup lang="ts">
import { Bookmark, Play } from '@lucide/vue'
import type { Game } from './data'
import AppLink from './AppLink.vue'
import ArtworkView from './ArtworkView.vue'

defineProps<{ game: Game; saved: boolean }>()
const emit = defineEmits<{ toggleSave: [] }>()
</script>

<template>
  <article class="game-card">
    <AppLink :href="`/games/${game.id}`" class="game-cover" :aria-label="`查看${game.title}`">
      <ArtworkView :src="game.image" :alt="`${game.title}游戏场景`" />
      <span class="cover-play"><Play :size="17" fill="currentColor" />查看作品</span>
    </AppLink>
    <div class="game-title-row">
      <AppLink :href="`/games/${game.id}`"><h3>{{ game.title }}</h3></AppLink>
      <button class="icon-button bookmark-button" :class="{ 'is-saved': saved }"
        :aria-label="saved ? `取消收藏${game.title}` : `收藏${game.title}`" :aria-pressed="saved"
        @click="emit('toggleSave')">
        <Bookmark :size="17" :fill="saved ? 'currentColor' : 'none'" />
      </button>
    </div>
    <p class="game-subtitle">{{ game.subtitle }}</p>
    <div class="game-meta">
      <span>{{ game.author }}<span class="meta-dot">·</span>{{ game.category }}</span>
      <span><Play :size="12" />{{ game.plays }}</span>
    </div>
  </article>
</template>
