<script setup lang="ts">
import { ref } from 'vue'
import { ArrowLeft, Bookmark, Clock3, Heart, Play, Send } from '@lucide/vue'
import { isComments, uid, type Game, type LocalComment } from './data'
import { useLocalState } from './local-state'
import AppLink from './AppLink.vue'
import ArtworkView from './ArtworkView.vue'
import PlayerPreview from './PlayerPreview.vue'
import TextLink from './TextLink.vue'

const props = defineProps<{ game: Game; saved: boolean }>()
const emit = defineEmits<{ toggleSave: []; notify: [message: string] }>()
const player = ref(false)
const comment = ref('')
const { state: comments, storageError } = useLocalState<LocalComment[]>(`tomcat-ui-comments-${props.game.id}`, [], isComments)

function submitComment() {
  if (!comment.value.trim()) return
  comments.value = [...comments.value, { id: uid(), text: comment.value.trim() }]
  comment.value = ''
  emit('notify', '留言已保存在此浏览器')
}
</script>

<template>
  <main id="main-content" class="page detail-page">
    <AppLink href="/" class="back-link"><ArrowLeft :size="15" />发现游戏</AppLink>
    <div class="detail-heading"><div><div class="detail-eyebrow"><span class="topic-category">{{ game.category }}</span><span>一个小小的独立游戏</span></div><h1>{{ game.title }}</h1><p>{{ game.subtitle }}</p></div><button class="button" :class="{ 'saved-button': saved }" :aria-pressed="saved" @click="emit('toggleSave')"><Bookmark :size="16" :fill="saved ? 'currentColor' : 'none'" />{{ saved ? '已收藏' : '收藏作品' }}</button></div>
    <div class="detail-layout">
      <div>
        <div class="detail-cover"><ArtworkView :src="game.image" :alt="`${game.title}完整场景`" eager /><button class="cover-preview-button" @click="player = true"><Play :size="15" />查看游玩界面</button></div>
        <section class="content-section"><h2>关于这个小世界</h2><p>{{ game.description }}</p><div class="game-tags"><span>{{ game.category }}</span><span>单人体验</span><span>中文</span><span>浏览器游戏</span></div></section>
        <section class="content-section comment-section">
          <div class="section-heading"><h2>留下你的想法<span class="subtle-count">{{ comments.length }}</span></h2><span class="muted-small">本地留言</span></div>
          <p class="comment-intro">一句感受，一个建议，都是创作者继续前行的动力。</p>
          <form @submit.prevent="submitComment"><label class="sr-only" for="game-comment">你的留言</label><textarea id="game-comment" v-model="comment" class="text-input" maxlength="500" required placeholder="你喜欢这个世界里的哪一个瞬间？" /><div class="comment-form-footer"><span>{{ comment.length }} / 500</span><button class="button button-primary" :disabled="!comment.trim()"><Send :size="15" />留下想法</button></div></form>
          <p v-if="storageError" class="danger-text" role="alert">留言无法保存，浏览器存储不可用。</p>
          <div v-for="item in comments" :key="item.id" class="comment"><span class="avatar">M</span><div><strong>我<span>刚刚 · 本地</span></strong><p>{{ item.text }}</p></div></div>
        </section>
      </div>
      <aside class="detail-sidebar">
        <div class="play-panel"><span class="small-tag">作品界面预览</span><h3>准备好出发了吗？</h3><p>打开一个新世界，<br />给自己一点游玩的时间。</p><button class="button button-primary" @click="player = true"><Play :size="16" fill="currentColor" />打开游玩预览</button><span class="play-footnote">当前为静态界面，尚未接入内核</span><div class="play-stats"><span><Clock3 :size="15" />{{ game.duration }}</span><span><Heart :size="15" />{{ game.likes }} 人喜欢</span></div></div>
        <div class="creator-panel"><span class="creator-avatar">{{ game.author.slice(0, 1) }}</span><div><span>由独立创作者带来</span><strong>{{ game.author }}</strong></div><p>做一点小而有趣的东西，<br />慢慢把想法变成世界。</p><TextLink :href="game.id === 'puzzle' ? '/community/first-puzzle' : game.id === 'desert' ? '/community/weekend' : '/community/forest-devlog'">看看创作日常</TextLink></div>
        <div class="detail-facts"><div><span>游玩方式</span><span>浏览器</span></div><div><span>支持语言</span><span>简体中文</span></div><div><span>作品状态</span><span>示例作品</span></div></div>
      </aside>
    </div>
    <PlayerPreview v-if="player" :game="game" @close="player = false" />
  </main>
</template>
