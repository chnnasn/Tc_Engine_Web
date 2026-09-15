<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowUpRight } from '@lucide/vue'
import { games } from './data'
import AppLink from './AppLink.vue'
import EmptyState from './EmptyState.vue'
import GameCard from './GameCard.vue'
import TextLink from './TextLink.vue'

const props = defineProps<{ saved: string[] }>()
const emit = defineEmits<{ toggleSave: [id: string] }>()
const favorites = computed(() => games.filter(game => props.saved.includes(game.id)))
</script>

<template>
  <main id="main-content" class="page profile-page"><div class="profile-summary"><span class="profile-avatar">M</span><div><span class="eyebrow">YOUR LITTLE COLLECTION</span><h1>你好，创作者</h1><p>把喜欢的世界，放在随时能找到的地方。</p></div><AppLink href="/projects" class="button">我的项目<ArrowUpRight :size="16" /></AppLink></div><div class="section-heading favorites-heading"><h2>我的收藏<span class="subtle-count">{{ favorites.length }}</span></h2><TextLink href="/">继续发现</TextLink></div><div v-if="favorites.length" class="game-grid"><GameCard v-for="game in favorites" :key="game.id" :game="game" saved @toggle-save="emit('toggleSave', game.id)" /></div><EmptyState v-else title="把喜欢的世界收藏起来" text="点击作品旁的收藏图标，它就会出现在这里。"><AppLink href="/" class="button button-primary">去发现游戏<ArrowRight :size="16" /></AppLink></EmptyState></main>
</template>
