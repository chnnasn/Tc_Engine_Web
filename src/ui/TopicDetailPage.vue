<script setup lang="ts">
import { ref } from 'vue'
import { ArrowLeft, MessageSquare, Send } from '@lucide/vue'
import { isComments, uid, type LocalComment, type Topic } from './data'
import { useLocalState } from './local-state'
import AppLink from './AppLink.vue'

const props = defineProps<{ topic: Topic; topics: Topic[] }>()
const emit = defineEmits<{ 'update:topics': [topics: Topic[]]; notify: [message: string] }>()
const reply = ref('')
const { state: replies, storageError } = useLocalState<LocalComment[]>(`tomcat-ui-replies-${props.topic.id}`, [], isComments)

function submitReply() {
  if (!reply.value.trim()) return
  replies.value = [...replies.value, { id: uid(), text: reply.value.trim() }]
  emit('update:topics', props.topics.map(topic => topic.id === props.topic.id ? { ...topic, replies: topic.replies + 1 } : topic))
  reply.value = ''
  emit('notify', '回复已保存在此浏览器')
}
</script>

<template>
  <main id="main-content" class="page topic-detail-page">
    <AppLink class="back-link" href="/community"><ArrowLeft :size="15" />返回社区</AppLink>
    <article class="topic-article"><span class="topic-category">{{ topic.category }}</span><h1>{{ topic.title }}</h1><div class="article-author"><span class="topic-avatar" :style="{ background: topic.color }">{{ topic.avatar }}</span><div><strong>{{ topic.author }}</strong><span>{{ topic.time }} · 社区话题</span></div></div><div class="article-body"><p v-for="(paragraph, index) in topic.content.split('\n').filter(Boolean)" :key="index">{{ paragraph }}</p></div><div class="article-footnote"><MessageSquare :size="15" /><span>一起聊聊你的想法</span><span>本地界面预览</span></div></article>
    <section class="topic-reply-section"><h2>参与讨论<span class="subtle-count">{{ replies.length }} 条本地回复</span></h2><p v-if="!replies.length" class="muted-small">还没有本地回复，来聊聊你的看法吧。</p><div v-for="item in replies" :key="item.id" class="comment"><span class="avatar">M</span><div><strong>我<span>刚刚 · 本地</span></strong><p>{{ item.text }}</p></div></div><form @submit.prevent="submitReply"><label for="topic-reply" class="field-label">写下你的回复</label><textarea id="topic-reply" v-model="reply" class="text-input" required maxlength="1000" placeholder="友善的交流，会让创作走得更远。" /><div class="comment-form-footer"><span>回复仅在此浏览器可见</span><button class="button button-primary" :disabled="!reply.trim()"><Send :size="15" />发送回复</button></div><p v-if="storageError" class="danger-text" role="alert">回复无法保存，浏览器存储不可用。</p></form></section>
  </main>
</template>
