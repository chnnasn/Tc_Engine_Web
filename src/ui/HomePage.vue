<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, ArrowUpRight, ChevronDown, MessageSquare, Sparkles } from '@lucide/vue'
import { games, initialTopics } from './data'
import AppLink from './AppLink.vue'
import ArtworkView from './ArtworkView.vue'
import EmptyState from './EmptyState.vue'
import GameCard from './GameCard.vue'
import SearchField from './SearchField.vue'
import TextLink from './TextLink.vue'

const props = defineProps<{ saved: string[] }>()
const emit = defineEmits<{ toggleSave: [id: string]; create: [] }>()
const category = ref('全部游戏')
const query = ref('')
const sort = ref('recommended')
const categories = ['全部游戏', '探索', '解谜', '冒险']

const filtered = computed(() => {
  const result = games.filter(game =>
    (category.value === '全部游戏' || game.category === category.value) &&
    `${game.title} ${game.author} ${game.subtitle}`.toLowerCase().includes(query.value.trim().toLowerCase()))
  if (sort.value === 'newest') return [...result].reverse()
  if (sort.value === 'popular') return [...result].sort((a, b) => b.likes - a.likes)
  return result
})
</script>

<template>
  <main id="main-content" class="page home-page">
    <div class="page-intro">
      <span class="eyebrow">A LITTLE PLAY, A LITTLE POSSIBILITY</span>
      <h1>发现游戏<span class="green-dot">.</span></h1>
      <p>有趣的世界，不一定很大。从这里，遇见下一个好玩的想法。</p>
    </div>

    <section class="feature" aria-label="本周精选作品">
      <div class="feature-copy">
        <div class="feature-label"><span class="small-line" />本周精选<span class="feature-number">VOL. 01</span></div>
        <div><span class="feature-genre">探索 · 慢节奏 · 治愈</span><h2>林间来信</h2><p>沿着溪流，穿过森林。<br />把一封信，送到世界的小小角落。</p></div>
        <div class="feature-bottom"><AppLink class="button button-dark" href="/games/forest">探索这个世界<ArrowUpRight :size="17" /></AppLink><span>by 木木工作室</span></div>
      </div>
      <AppLink href="/games/forest" class="feature-art" aria-label="探索林间来信">
        <ArtworkView :src="games[0].image" alt="林间来信：红斗篷旅人在溪流与小屋之间漫步" eager />
        <span class="image-label"><span />一个值得慢下来的世界</span>
      </AppLink>
    </section>

    <section class="discover-section" aria-labelledby="discover-title">
      <div class="section-heading">
        <div><h2 id="discover-title">值得一玩<span class="subtle-count">03</span></h2><p>独立创作者的小小世界，等你来探索。</p></div>
        <label class="sort-select"><span class="sr-only">游戏排序</span><select v-model="sort"><option value="recommended">编辑推荐</option><option value="newest">最近上架</option><option value="popular">人气优先</option></select><ChevronDown :size="14" /></label>
      </div>
      <div class="filter-bar">
        <div class="filter-tabs" aria-label="游戏分类"><button v-for="item in categories" :key="item" :class="{ active: category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button></div>
        <SearchField v-model="query" placeholder="搜索游戏或创作者" />
      </div>
      <div v-if="filtered.length" class="game-grid"><GameCard v-for="game in filtered" :key="game.id" :game="game" :saved="props.saved.includes(game.id)" @toggle-save="emit('toggleSave', game.id)" /></div>
      <EmptyState v-else title="还没有找到这个世界" text="换个关键词，或看看其他分类吧。"><button class="button" @click="query = ''; category = '全部游戏'">查看全部游戏</button></EmptyState>
    </section>

    <section class="home-bottom">
      <div class="community-preview">
        <div class="section-heading"><h2>创作这件小事</h2><TextLink href="/community">去社区逛逛</TextLink></div>
        <div class="compact-topics"><AppLink v-for="topic in initialTopics.slice(1, 4)" :key="topic.id" :href="`/community/${topic.id}`" class="compact-topic"><span class="topic-category">{{ topic.category }}</span><span class="compact-topic-title">{{ topic.title }}</span><span class="reply-count"><MessageSquare :size="14" />{{ topic.replies }}</span></AppLink></div>
      </div>
      <aside class="create-aside"><div class="aside-icon"><Sparkles :size="21" :stroke-width="1.5" /></div><h3>不止游玩，也来创造。</h3><p>给那个还没完成的想法，<br />一个开始的地方。</p><button class="text-link" @click="emit('create')">创建我的第一个项目<ArrowRight :size="17" /></button></aside>
    </section>
  </main>
</template>
