<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, ArrowUpRight, Check, Play } from '@lucide/vue'
import type { Game, Project } from './data'
import AppLink from './AppLink.vue'
import ArtworkView from './ArtworkView.vue'
import PlayerPreview from './PlayerPreview.vue'

const props = defineProps<{ project: Project }>()
const player = ref(false)
const game = computed<Game>(() => ({ id: props.project.id, title: props.project.name, subtitle: props.project.description, author: '我', category: props.project.template === '2D' ? '2D 游戏' : '创作原型', image: props.project.image, color: '#eef1e8', plays: '0', likes: 0, duration: '待设置', description: props.project.description }))
</script>

<template>
  <main id="main-content" class="page detail-page"><AppLink href="/projects" class="back-link"><ArrowLeft :size="15" />返回我的项目</AppLink><div class="workspace-note"><span class="note-icon"><Check :size="20" /></span><div><strong>这是你的作品发布预览</strong><p>项目已保存在本地，当前页面仅在此浏览器可见。</p></div><span class="small-tag">尚未公开发布</span></div><div class="detail-heading"><div><div class="detail-eyebrow"><span class="topic-category">{{ game.category }}</span><span>由我创作</span></div><h1>{{ project.name }}</h1><p>{{ project.description || '一个新的好玩想法，正在慢慢发生。' }}</p></div><AppLink :href="`/editor/${project.id}`" class="button">继续编辑<ArrowUpRight :size="16" /></AppLink></div><div class="detail-layout"><div><div class="detail-cover"><ArtworkView :src="project.image" :alt="`${project.name}作品封面`" eager /></div><section class="content-section"><h2>关于这个小世界</h2><p>{{ project.description || '还没有写下作品介绍，可以在编辑器的发布预览中补充。' }}</p><div class="game-tags"><span>{{ game.category }}</span><span>创作者：我</span><span>本地预览</span></div></section></div><aside class="detail-sidebar"><div class="play-panel"><span class="small-tag">作品界面预览</span><h3>你的想法，有了模样。</h3><p>先看看作品的展示效果，<br />再回到编辑器继续完善。</p><button class="button button-primary" @click="player = true"><Play :size="16" />打开游玩预览</button><span class="play-footnote">当前为静态界面，尚未接入内核</span></div></aside></div><PlayerPreview v-if="player" :game="game" @close="player = false" /></main>
</template>
