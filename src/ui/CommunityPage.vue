<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, MessageSquare, Pin, Plus, Send } from '@lucide/vue'
import { topicCategories, uid, type Topic } from './data'
import { useNavigation } from './navigation'
import AppLink from './AppLink.vue'
import AppModal from './AppModal.vue'
import EmptyState from './EmptyState.vue'
import SearchField from './SearchField.vue'
import TextLink from './TextLink.vue'

const props = defineProps<{ topics: Topic[] }>()
const emit = defineEmits<{ 'update:topics': [topics: Topic[]]; notify: [message: string] }>()
const navigate = useNavigation()
const category = ref('全部话题')
const query = ref('')
const compose = ref(false)
const title = ref('')
const content = ref('')
const postCategory = ref('综合讨论')
const visible = computed(() => props.topics.filter(topic =>
  (category.value === '全部话题' || topic.category === category.value) &&
  `${topic.title} ${topic.author}`.toLowerCase().includes(query.value.trim().toLowerCase())))

function publish() {
  if (!title.value.trim() || !content.value.trim()) return
  const id = uid()
  emit('update:topics', [{ id, title: title.value.trim(), content: content.value.trim(), category: postCategory.value, author: '我', avatar: 'M', color: '#e5ece4', time: '刚刚', replies: 0 }, ...props.topics])
  compose.value = false
  emit('notify', '话题已保存在本地')
  navigate(`/community/${id}`)
}
</script>

<template>
  <main id="main-content" class="page community-page">
    <div class="page-topline"><div class="page-intro"><span class="eyebrow">MADE BETTER, TOGETHER</span><h1>创作者社区<span class="green-dot">.</span></h1><p>聊聊游戏，分享进展，也为彼此的想法加一点油。</p></div><button class="button button-primary" @click="compose = true"><Plus :size="16" />发起话题</button></div>
    <div class="community-layout">
      <div class="community-main">
        <div class="community-filter"><div class="filter-tabs"><button v-for="item in topicCategories" :key="item" :class="{ active: category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button></div><SearchField v-model="query" placeholder="搜索话题或创作者" /></div>
        <div class="topics-list">
          <AppLink v-for="topic in visible" :key="topic.id" class="topic-row" :href="`/community/${topic.id}`"><span class="topic-avatar" :style="{ background: topic.color }">{{ topic.avatar }}</span><div class="topic-main"><h3><Pin v-if="topic.pinned" :size="13" class="pin-icon" />{{ topic.title }}</h3><div class="topic-meta"><span class="topic-category">{{ topic.category }}</span><span>{{ topic.author }}</span><span>{{ topic.time }}</span></div></div><span class="topic-replies"><MessageSquare :size="16" /><span>{{ topic.replies }}</span></span><ChevronRight :size="16" class="topic-chevron" /></AppLink>
          <EmptyState v-if="!visible.length" title="还没有找到这个话题" text="换个关键词，或发起一个新的讨论。" />
        </div>
        <p class="list-end">每个想法，都值得被听见。</p>
      </div>
      <aside class="community-sidebar"><div class="community-welcome"><span class="eyebrow">HELLO, CREATOR</span><h2>很高兴在这里<br />遇见你。</h2><p>不论你是第一次尝试创作，还是已经做了很多个游戏，这里总有一个位置留给你。</p><TextLink href="/community/welcome">从打个招呼开始</TextLink></div><div class="community-guide"><h3>让交流简单一点</h3><p><span>01</span>分享真实的创作过程</p><p><span>02</span>给出具体、友善的反馈</p><p><span>03</span>尊重每一个不同的想法</p></div><div class="sidebar-note"><MessageSquare :size="17" /><p>当前是社区界面预览。<br />新话题与回复仅在本地可见。</p></div></aside>
    </div>

    <AppModal v-if="compose" title="分享你的新想法" wide @close="compose = false">
      <p class="dialog-description">开发日常、创作问题，或者一个值得分享的小发现。</p>
      <form @submit.prevent="publish"><label class="field-label" for="topic-title">话题标题</label><input id="topic-title" v-model="title" class="text-input" required autofocus maxlength="80" placeholder="用一句话说说你想聊什么" /><label class="field-label" for="topic-category">选择分类</label><select id="topic-category" v-model="postCategory" class="text-input"><option v-for="item in topicCategories.slice(1)" :key="item">{{ item }}</option></select><label class="field-label" for="topic-content">正文</label><textarea id="topic-content" v-model="content" class="text-input compose-textarea" required maxlength="5000" placeholder="从这里开始，慢慢说。" /><p class="local-note">此操作会创建本地话题预览，暂不会发布到互联网。</p><div class="dialog-actions"><button class="button" type="button" @click="compose = false">取消</button><button class="button button-primary" :disabled="!title.trim() || !content.trim()"><Send :size="15" />发布到本地预览</button></div></form>
    </AppModal>
  </main>
</template>
