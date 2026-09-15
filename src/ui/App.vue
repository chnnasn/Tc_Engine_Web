<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { ArrowRight, ArrowUpRight, Check, Gamepad2, Plus } from '@lucide/vue'
import { games, initialProjects, initialTopics, isProjects, isStringArray, isTopics, nowLabel, uid, type Project } from './data'
import { useLocalState } from './local-state'
import { navigationKey } from './navigation'
import AppLink from './AppLink.vue'
import AppModal from './AppModal.vue'
import CommunityPage from './CommunityPage.vue'
import EditorPage from './EditorPage.vue'
import GameDetailPage from './GameDetailPage.vue'
import HomePage from './HomePage.vue'
import NotFoundPage from './NotFoundPage.vue'
import ProfilePage from './ProfilePage.vue'
import ProjectsPage from './ProjectsPage.vue'
import PublishedPreviewPage from './PublishedPreviewPage.vue'
import TopicDetailPage from './TopicDetailPage.vue'

const path = ref(normalizePath(location.pathname))
const editorDirty = ref(false)
const { state: saved, storageError: saveError } = useLocalState<string[]>('tomcat-ui-bookmarks-v1', [], isStringArray)
const { state: projects, storageError: projectError } = useLocalState<Project[]>('tomcat-ui-projects-v1', initialProjects, isProjects)
const { state: topics, storageError: topicError } = useLocalState('tomcat-ui-topics-v1', initialTopics, isTopics)
const newProject = ref(false)
const projectName = ref('')
const template = ref<'2D' | '空白'>('2D')
const toast = ref('')
const accountOpen = ref(false)
let toastTimer: number | undefined

const game = computed(() => games.find(item => path.value === `/games/${item.id}`))
const topic = computed(() => topics.value.find(item => path.value === `/community/${item.id}`))
const previewProject = computed(() => projects.value.find(item => item.status === 'published' && path.value === `/preview/${item.id}`))
const editorProject = computed(() => projects.value.find(item => path.value === `/editor/${item.id}`) || (path.value === '/editor' ? projects.value[0] : undefined))
const isEditor = computed(() => Boolean(editorProject.value))
const storageError = computed(() => saveError.value || projectError.value || topicError.value)

function normalizePath(value: string) {
  return value.replace(/\/$/, '') || '/'
}

function navigate(url: string) {
  if (url === path.value) return
  history.pushState({}, '', url)
  path.value = normalizePath(url)
  window.scrollTo({ top: 0 })
  accountOpen.value = false
}

provide(navigationKey, navigate)

function notify(message: string) {
  toast.value = message
}

function toggleSave(id: string) {
  const wasSaved = saved.value.includes(id)
  saved.value = wasSaved ? saved.value.filter(item => item !== id) : [...saved.value, id]
  notify(wasSaved ? '已取消收藏' : '已加入我的收藏')
}

function openCreate() {
  projectName.value = ''
  template.value = '2D'
  newProject.value = true
}

function createProject() {
  if (!projectName.value.trim()) return
  projects.value = [{ id: uid(), name: projectName.value.trim(), template: template.value, image: '', status: 'draft', updated: nowLabel(), description: '一个新的好玩想法。' }, ...projects.value]
  newProject.value = false
  notify('项目已创建')
  navigate('/projects')
}

function updateProject(next: Project) {
  projects.value = projects.value.map(project => project.id === next.id ? next : project)
}

function handlePopState() {
  if (editorDirty.value && !window.confirm('当前场景有未保存的修改。确定放弃修改并离开编辑器吗？')) {
    history.pushState({}, '', path.value)
    return
  }
  path.value = normalizePath(location.pathname)
  window.scrollTo({ top: 0 })
}

watch(toast, value => {
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
  if (value) toastTimer = window.setTimeout(() => { toast.value = '' }, 3200)
})

watch(path, async () => {
  const title = editorProject.value?.name || previewProject.value?.name || game.value?.title || topic.value?.title ||
    (path.value === '/projects' ? '我的项目' : path.value === '/community' ? '创作者社区' : path.value === '/profile' ? '我的收藏' : '发现游戏')
  document.title = `${title} · TomCat`
  await nextTick()
  const main = document.getElementById('main-content')
  main?.setAttribute('tabindex', '-1')
  main?.focus({ preventScroll: true })
}, { immediate: true })

onMounted(() => window.addEventListener('popstate', handlePopState))
onBeforeUnmount(() => {
  window.removeEventListener('popstate', handlePopState)
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
})
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <header v-if="!isEditor" class="site-header">
    <div class="header-inner">
      <AppLink href="/" class="brand" aria-label="TomCat 首页"><span class="brand-mark"><Gamepad2 :size="21" :stroke-width="1.8" /></span><span>tomcat<span class="brand-dot">.</span></span></AppLink>
      <nav class="main-nav" aria-label="主导航"><AppLink href="/" :aria-current="path === '/' || path.startsWith('/games') ? 'page' : undefined" :class="{ active: path === '/' || path.startsWith('/games') }">发现游戏</AppLink><AppLink href="/community" :aria-current="path.startsWith('/community') ? 'page' : undefined" :class="{ active: path.startsWith('/community') }">社区</AppLink><AppLink href="/projects" :aria-current="path.startsWith('/projects') ? 'page' : undefined" :class="{ active: path.startsWith('/projects') }">我的项目</AppLink></nav>
      <div class="header-actions"><span class="preview-badge">界面预览</span><button class="button button-primary header-create" @click="openCreate"><Plus :size="16" />新建项目</button><div class="account-area"><button class="avatar" aria-label="打开我的账户" :aria-expanded="accountOpen" @click="accountOpen = !accountOpen">M</button><div v-if="accountOpen" class="account-menu"><strong>你好，创作者</strong><span>示例账号 · 本地空间</span><AppLink href="/profile">我的收藏 <ArrowUpRight :size="15" /></AppLink><AppLink href="/projects">项目工作台 <ArrowUpRight :size="15" /></AppLink></div></div></div>
    </div>
  </header>

  <HomePage v-if="path === '/'" :saved="saved" @toggle-save="toggleSave" @create="openCreate" />
  <ProjectsPage v-else-if="path === '/projects'" :projects="projects" @update:projects="projects = $event" @create="openCreate" @notify="notify" />
  <CommunityPage v-else-if="path === '/community'" :topics="topics" @update:topics="topics = $event" @notify="notify" />
  <ProfilePage v-else-if="path === '/profile'" :saved="saved" @toggle-save="toggleSave" />
  <PublishedPreviewPage v-else-if="previewProject" :key="previewProject.id" :project="previewProject" />
  <GameDetailPage v-else-if="game" :key="game.id" :game="game" :saved="saved.includes(game.id)" @toggle-save="toggleSave(game.id)" @notify="notify" />
  <TopicDetailPage v-else-if="topic" :key="topic.id" :topic="topic" :topics="topics" @update:topics="topics = $event" @notify="notify" />
  <EditorPage v-else-if="editorProject" :key="editorProject.id" :project="editorProject" @dirty-change="editorDirty = $event" @update-project="updateProject" @notify="notify" />
  <NotFoundPage v-else />

  <footer v-if="!isEditor" class="site-footer"><div><AppLink href="/" class="footer-brand">tomcat.</AppLink><span>让好玩的想法发生。</span></div><span>界面预览 · 数据仅保存在此浏览器</span><span>© 2026 TomCat</span></footer>
  <div v-if="storageError" class="storage-warning" role="alert">浏览器存储不可用，当前修改将在关闭页面后丢失。</div>
  <div v-if="toast" class="toast" role="status"><Check :size="17" />{{ toast }}</div>

  <AppModal v-if="newProject" title="开始一个新项目" @close="newProject = false">
    <p class="dialog-description">先给你的想法起个名字，剩下的慢慢来。</p>
    <form @submit.prevent="createProject"><label class="field-label" for="project-name">项目名称</label><input id="project-name" v-model="projectName" class="text-input" autofocus required maxlength="32" placeholder="例如：森林里的小小冒险" /><span class="field-hint">可以随时修改，最多 32 个字。</span><fieldset class="template-field"><legend>从哪里开始</legend><div class="template-options"><label v-for="item in (['2D', '空白'] as const)" :key="item" class="template-option" :class="{ selected: template === item }"><input v-model="template" type="radio" name="template" :value="item" /><Gamepad2 :size="22" /><strong>{{ item === '2D' ? '2D 场景' : '空白项目' }}</strong><span>{{ item === '2D' ? '从基础场景开始创作' : '留一张白纸给你的想法' }}</span></label></div></fieldset><p class="local-note">当前为静态原型，新项目仅保存在此浏览器。</p><div class="dialog-actions"><button type="button" class="button" @click="newProject = false">再想想</button><button class="button button-primary" :disabled="!projectName.trim()">创建项目<ArrowRight :size="16" /></button></div></form>
  </AppModal>
</template>
