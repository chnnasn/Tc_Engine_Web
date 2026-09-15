<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, Box, Camera, Check, ChevronDown, CircleHelp, Code2, Eye, EyeOff, File, Folder, Gamepad2, Grid2X2, Image, Layers, Minus, MousePointer2, Move, Plus, RotateCcw, Save, Settings2, Trash2, Upload, X } from '@lucide/vue'
import { games, isScene, nowLabel, uid, type Project, type Scene, type SceneObject } from './data'
import { useNavigation } from './navigation'
import { exportProject } from './project-file'
import AppLink from './AppLink.vue'
import AppModal from './AppModal.vue'
import SceneStage from './SceneStage.vue'

const props = defineProps<{ project: Project }>()
const emit = defineEmits<{
  updateProject: [project: Project]
  notify: [message: string]
  dirtyChange: [dirty: boolean]
}>()
const navigate = useNavigation()
const scene = ref<Scene>(loadScene(props.project))
const selectedId = ref(scene.value.objects.find(object => object.type === 'sprite')?.id || 'camera')
const dirty = ref(false)
const zoom = ref(100)
const grid = ref(true)
const leftTab = ref<'scene' | 'files'>('scene')
const rightTab = ref<'properties' | 'settings'>('properties')
const bottomTab = ref<'assets' | 'log'>('assets')
const panel = ref<'preview' | 'publish' | 'help' | 'leave' | null>(null)
const publishTitle = ref(props.project.name)
const description = ref(props.project.description)
const saveTime = ref('')
const mobilePanel = ref<'scene' | 'properties' | null>(null)
const selected = computed(() => scene.value.objects.find(object => object.id === selectedId.value))

watch(dirty, value => emit('dirtyChange', value), { immediate: true })

function makeScene(project: Project): Scene {
  return { sceneName: 'Main Scene', background: project.image, objects: [
    { id: 'camera', name: 'Main Camera', type: 'camera', x: 0, y: 0, rotation: 0, scale: 1, visible: true },
    ...(project.template === '2D' ? [{ id: 'player', name: 'Player', type: 'sprite' as const, x: 0, y: 0, rotation: 0, scale: 1, visible: true }] : []),
  ] }
}

function loadScene(project: Project): Scene {
  try {
    const saved = JSON.parse(localStorage.getItem(`tomcat-ui-scene-${project.id}`) || 'null')
    if (isScene(saved)) return saved
  } catch {
    // Fall back to a usable initial scene.
  }
  return makeScene(project)
}

function changeScene(next: Scene) {
  scene.value = next
  dirty.value = true
}

function changeObject(partial: Partial<SceneObject>) {
  changeScene({ ...scene.value, objects: scene.value.objects.map(object => object.id === selectedId.value ? { ...object, ...partial } : object) })
}

function save(quiet = false): boolean {
  try {
    localStorage.setItem(`tomcat-ui-scene-${props.project.id}`, JSON.stringify(scene.value))
    emit('updateProject', { ...props.project, image: scene.value.background, updated: nowLabel() })
    dirty.value = false
    saveTime.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (!quiet) emit('notify', '场景已保存到此浏览器')
    return true
  } catch {
    emit('notify', '保存失败：浏览器存储不可用，请导出备份')
    return false
  }
}

function addObject() {
  if (scene.value.objects.length >= 100) {
    emit('notify', '当前原型最多支持 100 个对象')
    return
  }
  const id = uid()
  changeScene({ ...scene.value, objects: [...scene.value.objects, { id, name: `Sprite ${scene.value.objects.filter(object => object.type === 'sprite').length + 1}`, type: 'sprite', x: 40, y: 0, rotation: 0, scale: 1, visible: true }] })
  selectedId.value = id
  emit('notify', '已添加场景对象')
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0))
}

function inputNumber(event: Event) {
  return Number((event.target as HTMLInputElement).value)
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}

function handleShortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    save()
  }
}

function publish() {
  if (!publishTitle.value.trim() || !save(true)) return
  emit('updateProject', { ...props.project, name: publishTitle.value.trim(), description: description.value.trim(), image: scene.value.background, status: 'published', updated: nowLabel() })
  panel.value = null
  emit('notify', '已生成本地发布预览')
  navigate(`/preview/${props.project.id}`)
}

function handleLeave(event: MouseEvent) {
  if (dirty.value) {
    event.preventDefault()
    panel.value = 'leave'
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('keydown', handleShortcut)
})
onBeforeUnmount(() => {
  emit('dirtyChange', false)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('keydown', handleShortcut)
})
</script>

<template>
  <main id="main-content" class="editor-page" tabindex="-1">
    <header class="editor-header">
      <div class="editor-project-info"><AppLink href="/projects" class="icon-button" aria-label="返回我的项目" @click="handleLeave"><ArrowLeft :size="18" /></AppLink><span class="editor-header-divider" /><span class="editor-project-icon"><Gamepad2 :size="21" /></span><div><strong>{{ project.name }}</strong><span>{{ dirty ? '有未保存的修改' : saveTime ? `已保存 · ${saveTime}` : '本地项目' }}<span class="editor-dot">·</span>静态编辑器</span></div></div>
      <div class="editor-header-actions"><button class="icon-button editor-help" aria-label="编辑器使用说明" @click="panel = 'help'"><CircleHelp :size="18" /></button><button class="button editor-save" @click="save()"><Save :size="15" /><span>保存</span></button><button class="button" @click="panel = 'preview'"><Eye :size="16" /><span>预览</span></button><button class="button button-primary" @click="publishTitle = project.name; description = project.description; panel = 'publish'"><Upload :size="15" /><span>发布预览</span></button></div>
    </header>

    <div class="mobile-editor-tabs"><button :class="{ active: mobilePanel === 'scene' }" @click="mobilePanel = mobilePanel === 'scene' ? null : 'scene'"><Layers :size="15" />场景层级</button><span>场景工作台</span><button :class="{ active: mobilePanel === 'properties' }" @click="mobilePanel = mobilePanel === 'properties' ? null : 'properties'"><Settings2 :size="15" />对象属性</button></div>

    <div class="editor-layout">
      <aside class="editor-left" :class="{ 'mobile-panel-open': mobilePanel === 'scene' }">
        <div class="panel-tabs"><button :class="{ active: leftTab === 'scene' }" @click="leftTab = 'scene'">场景层级</button><button :class="{ active: leftTab === 'files' }" @click="leftTab = 'files'">项目文件</button></div>
        <template v-if="leftTab === 'scene'"><div class="scene-tree-heading"><span><ChevronDown :size="13" /><Layers :size="14" />{{ scene.sceneName }}</span><button class="icon-button" aria-label="添加场景对象" @click="addObject"><Plus :size="15" /></button></div><div class="scene-tree"><div v-for="object in scene.objects" :key="object.id" class="tree-row" :class="{ selected: selectedId === object.id }"><button class="tree-select" :aria-pressed="selectedId === object.id" @click="selectedId = object.id; mobilePanel && (mobilePanel = 'properties')"><Camera v-if="object.type === 'camera'" :size="14" /><Folder v-else-if="object.type === 'group'" :size="14" /><Box v-else :size="14" /><span>{{ object.name }}</span></button><button class="tree-visibility" :aria-label="`${object.visible ? '隐藏' : '显示'}${object.name}`" @click="changeScene({ ...scene, objects: scene.objects.map(item => item.id === object.id ? { ...item, visible: !item.visible } : item) })"><Eye v-if="object.visible" :size="12" /><EyeOff v-else :size="12" /></button></div></div><button class="add-object" @click="addObject"><Plus :size="14" />添加对象</button></template>
        <div v-else class="file-tree"><span><ChevronDown :size="13" /><Folder :size="14" />{{ project.name }}</span><button @click="leftTab = 'scene'; emit('notify', '已打开主场景')"><File :size="14" />Main Scene</button><button @click="bottomTab = 'assets'; emit('notify', '素材库已展开')"><Folder :size="14" />Assets<span>3</span></button><button @click="rightTab = 'settings'; mobilePanel = 'properties'"><Settings2 :size="14" />项目设置</button></div>
        <div class="left-panel-bottom"><span class="local-status-dot" />本地创作空间</div>
      </aside>

      <section class="editor-center">
        <div class="canvas-tabs"><span><Image :size="14" />{{ scene.sceneName }}<span v-if="dirty" class="unsaved-dot" /></span><span class="canvas-kind">2D 场景视图</span></div>
        <div class="canvas-toolbar"><div><span class="tool-active" title="选择对象"><MousePointer2 :size="16" /></span><span class="toolbar-separator" /><span class="toolbar-hint">在右侧调整对象属性</span></div><div><button class="icon-button" :class="{ 'tool-on': grid }" aria-label="切换场景网格" :aria-pressed="grid" @click="grid = !grid"><Grid2X2 :size="15" /></button><span class="toolbar-separator" /><button class="icon-button" :disabled="zoom <= 50" aria-label="缩小画布" @click="zoom = Math.max(50, zoom - 10)"><Minus :size="14" /></button><button class="zoom-value" aria-label="重置缩放为百分之百" @click="zoom = 100">{{ zoom }}%</button><button class="icon-button" :disabled="zoom >= 150" aria-label="放大画布" @click="zoom = Math.min(150, zoom + 10)"><Plus :size="14" /></button></div></div>
        <div class="canvas-workspace"><div class="canvas-ruler-x"><span>−400</span><span>−200</span><span>0</span><span>200</span><span>400</span></div><span class="canvas-axis">Y</span><SceneStage :scene="scene" :selected-id="selectedId" :grid="grid" :zoom="zoom" @select="selectedId = $event" /><div class="canvas-caption"><span><span />场景外观示意</span><span>1600 × 900</span></div></div>
        <div class="asset-panel"><div class="asset-panel-header"><div class="panel-tabs"><button :class="{ active: bottomTab === 'assets' }" @click="bottomTab = 'assets'"><Folder :size="13" />素材库<span>3</span></button><button :class="{ active: bottomTab === 'log' }" @click="bottomTab = 'log'"><Code2 :size="13" />操作记录</button></div><span>点击素材可替换场景背景</span></div><div v-if="bottomTab === 'assets'" class="asset-grid"><button v-for="game in games" :key="game.id" class="asset-item" :class="{ active: scene.background === game.image }" @click="changeScene({ ...scene, background: game.image }); emit('notify', `已将“${game.title}”设为场景背景`)"><img :src="game.image" alt="" /><span><Image :size="11" />{{ game.id }}.webp</span></button><button class="asset-item empty-asset" @click="changeScene({ ...scene, background: '' })"><span><X :size="20" />清空背景</span></button></div><div v-else class="editor-log"><p><Check :size="13" />已打开项目：{{ project.name }}</p><p><Check :size="13" />{{ dirty ? '场景已修改，等待保存。' : saveTime ? `场景已保存于 ${saveTime}。` : '场景数据已就绪。' }}</p><p><CircleHelp :size="13" />当前为静态编辑器，未加载上游内核。</p></div></div>
      </section>

      <aside class="editor-right" :class="{ 'mobile-panel-open': mobilePanel === 'properties' }">
        <div class="panel-tabs"><button :class="{ active: rightTab === 'properties' }" @click="rightTab = 'properties'">对象属性</button><button :class="{ active: rightTab === 'settings' }" @click="rightTab = 'settings'">场景设置</button></div>
        <template v-if="rightTab === 'properties' && selected"><div class="inspector-object"><span><Camera v-if="selected.type === 'camera'" :size="21" /><Box v-else :size="21" /></span><div><strong>{{ selected.name }}</strong><span>{{ selected.type === 'camera' ? 'Camera' : 'Sprite' }}<span class="editor-dot">·</span>场景对象</span></div></div><div class="inspector-section"><label class="inspector-label" for="object-name">对象名称</label><input id="object-name" class="inspector-input" maxlength="40" :value="selected.name" @input="changeObject({ name: ($event.target as HTMLInputElement).value })" /><label class="inspector-checkbox"><input type="checkbox" :checked="selected.visible" @change="changeObject({ visible: ($event.target as HTMLInputElement).checked })" />在场景中显示</label></div><div class="inspector-section"><h3><Move :size="13" />变换 <button class="icon-button" aria-label="重置对象变换" @click="changeObject({ x: 0, y: 0, rotation: 0, scale: 1 })"><RotateCcw :size="13" /></button></h3><label class="inspector-label">位置</label><div class="coordinate-fields"><label v-for="axis in (['x', 'y'] as const)" :key="axis"><span :class="axis">{{ axis.toUpperCase() }}</span><input type="number" :aria-label="`位置 ${axis.toUpperCase()}`" :value="selected[axis]" min="-1000" max="1000" @input="changeObject({ [axis]: clamp(inputNumber($event), -1000, 1000) })" /></label></div><div class="property-row"><label for="object-rotation">旋转</label><div><input id="object-rotation" type="number" :value="selected.rotation" min="-360" max="360" @input="changeObject({ rotation: clamp(inputNumber($event), -360, 360) })" /><span>°</span></div></div><div class="property-row"><label for="object-scale">缩放</label><div><input id="object-scale" type="number" :value="selected.scale" min=".1" max="4" step=".1" @input="changeObject({ scale: clamp(inputNumber($event), .1, 4) })" /><span>×</span></div></div></div><div class="inspector-section"><h3><Camera v-if="selected.type === 'camera'" :size="13" /><Image v-else :size="13" />{{ selected.type === 'camera' ? '相机' : '精灵' }}</h3><div class="property-text"><span>{{ selected.type === 'camera' ? '投影' : '渲染方式' }}</span><span>{{ selected.type === 'camera' ? '正交' : '2D 图像' }}</span></div><div class="property-text"><span>可见性</span><span>{{ selected.visible ? '显示' : '隐藏' }}</span></div><p class="inspector-note">对象框用于界面演示，场景行为将在接入内核后支持。</p></div><div v-if="selected.type !== 'camera'" class="inspector-section"><button class="delete-object" @click="changeScene({ ...scene, objects: scene.objects.filter(object => object.id !== selectedId) }); selectedId = 'camera'; emit('notify', '对象已移除，保存后生效')"><Trash2 :size="13" />移除对象</button></div></template>
        <div v-else-if="rightTab === 'settings'" class="inspector-section"><label class="inspector-label" for="scene-name">场景名称</label><input id="scene-name" class="inspector-input" maxlength="64" :value="scene.sceneName" @input="changeScene({ ...scene, sceneName: ($event.target as HTMLInputElement).value })" /><div class="property-text"><span>画布比例</span><span>16 : 9</span></div><div class="property-text"><span>项目类型</span><span>{{ project.template }}</span></div><p class="inspector-note">素材库中的示例图片可以用作场景背景。</p><button class="button inspector-export" @click="exportProject({ ...project, image: scene.background }, scene); emit('notify', '已导出当前项目与场景数据')"><Upload :size="14" />导出项目</button></div>
        <div v-else class="inspector-empty">在场景层级中选择一个对象</div>
        <div class="inspector-footer"><Settings2 :size="13" />属性修改后，请保存项目。</div>
      </aside>
    </div>

    <footer class="editor-statusbar"><span><span class="local-status-dot" />{{ dirty ? '未保存' : '已就绪' }}<span class="statusbar-divider">|</span>静态界面预览 · 不运行上游内核</span><span>{{ scene.objects.length }} 个对象<span class="statusbar-divider">|</span>TomCat Studio</span></footer>

    <AppModal v-if="panel === 'preview'" :title="`${project.name} · 场景预览`" wide @close="panel = null"><div class="editor-scene-preview"><SceneStage :scene="scene" :selected-id="selectedId" preview /></div><p class="local-note">这是编辑器内的场景展示，不会运行游戏逻辑。请在关闭预览后保存你的修改。</p><div class="dialog-actions"><button class="button button-primary" @click="panel = null">继续创作</button></div></AppModal>
    <AppModal v-if="panel === 'publish'" title="给你的作品一个亮相的地方" @close="panel = null"><p class="dialog-description">先完善作品介绍，看看发布后的样子。</p><form @submit.prevent="publish"><label class="field-label" for="publish-title">作品名称</label><input id="publish-title" v-model="publishTitle" class="text-input" required maxlength="32" /><label class="field-label" for="publish-description">一句话介绍</label><textarea id="publish-description" v-model="description" class="text-input" maxlength="300" placeholder="这个世界里，有什么在等待玩家？" /><p class="local-note">当前仅生成本地发布预览，不会上传文件或公开作品。接入后端和引擎后，才能支持实际发布与游玩。</p><div class="dialog-actions"><button class="button" type="button" @click="panel = null">再改一改</button><button class="button button-primary" :disabled="!publishTitle.trim()">生成发布预览</button></div></form></AppModal>
    <AppModal v-if="panel === 'help'" title="从一个小场景开始" @close="panel = null"><div class="editor-help-content"><p>在左侧选择场景对象，在右侧修改名称、位置、旋转和缩放。</p><p>点击下方素材可替换场景背景。通过工具栏缩放画布或切换网格。</p><p>点击“保存”或按 Ctrl / ⌘ + S，将当前场景保存在浏览器中。项目管理页支持导出和重新导入。</p></div><p class="local-note">当前为静态交互原型，不支持游戏逻辑、物理模拟或上游引擎功能。</p><div class="dialog-actions"><button class="button button-primary" @click="panel = null">开始创作</button></div></AppModal>
    <AppModal v-if="panel === 'leave'" title="还有一些想法没有保存" @close="panel = null"><p class="dialog-description delete-description">保存当前场景，下次回来可以接着创作。</p><div class="dialog-actions"><button class="button" @click="panel = null">继续编辑</button><AppLink class="button" href="/projects">放弃修改</AppLink><AppLink class="button button-primary" href="/projects" @click="event => { if (!save(true)) event.preventDefault() }">保存并返回</AppLink></div></AppModal>
  </main>
</template>
