<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { installEditorInputLock } from './editor-input-lock'

type RuntimeCanvasProps = { project?: any }

const props = defineProps<RuntimeCanvasProps>()
const emit = defineEmits<{
  ready: [runtime: any]
  error: [error: Error]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const status = ref('正在加载上游编辑器…')
const error = ref<string | null>(null)
const ready = ref(false)
const scriptLoads = new Map<string, Promise<void>>()

let disposed = false
let runtime: any
let removeInputLock: (() => void) | undefined

function loadScript(src: string) {
  const existing = scriptLoads.get(src)
  if (existing) return existing

  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => {
      scriptLoads.delete(src)
      reject(new Error(`资源加载失败：${src}`))
    }
    document.head.appendChild(script)
  })
  scriptLoads.set(src, pending)
  return pending
}

function preventBrowserShortcut(event: KeyboardEvent) {
  if (document.activeElement !== canvasRef.value || event.isComposing) return
  const key = event.key.toLowerCase()
  const modified = event.ctrlKey || event.metaKey
  const upstreamShortcut = modified && ['n', 'o', 's', 'd', 'z', 'y'].includes(key)
  const browserShortcut = (modified && ['p', 'r'].includes(key))
    || event.key === 'F5'
    || (event.altKey && ['arrowleft', 'arrowright', 'home'].includes(key))
  if (upstreamShortcut || browserShortcut || event.key === 'Backspace' || event.key === 'Tab') event.preventDefault()
}

function setFailure(reason: unknown) {
  const cause = reason instanceof Error ? reason : new Error(String(reason))
  if (disposed) return
  error.value = cause.message
  emit('error', cause)
}

async function start() {
  try {
    if (!window.TomCatEngineHost) throw new Error('Vue 运行时适配器未初始化')
    if (typeof window.TomCatWebModule !== 'function') {
      await loadScript('/runtime/tomcat_web_module.js?v=20260907-cjk')
    }
    if (disposed) return
    if (typeof window.TomCatEngineHost?.EngineRuntime !== 'function') throw new Error('EngineRuntime 未找到')
    if (!canvasRef.value) throw new Error('Canvas 未挂载')

    const params = new URLSearchParams(location.search)
    const raw = props.project
      || window.TomCatStore?.get?.(params.get('project') || localStorage.getItem('tomcat.lastProjectId') || '')
      || window.TomCatStore?.list?.()[0]
      || { id: 'MainScene', name: 'MainScene' }
    document.title = `${raw.name || 'TomCat Engine'} · TomCat Engine`

    runtime = new window.TomCatEngineHost.EngineRuntime({ canvas: canvasRef.value, project: raw })
    window.TomCatRuntime = runtime
    window.TomCatRuntimeReady = runtime.ready
    await runtime.ready
    if (disposed) {
      runtime?.shutdown?.()
      return
    }
    ready.value = true
    status.value = `上游 EditorLayer · WebGL2 · ${raw.name || 'TomCat Engine'}`
    emit('ready', runtime)
    canvasRef.value?.focus()
  } catch (reason) {
    setFailure(reason)
  }
}

function logRuntime(event: Event) {
  status.value = String((event as CustomEvent).detail || '')
}

function capturePointer(event: PointerEvent) {
  canvasRef.value?.focus()
  canvasRef.value?.setPointerCapture(event.pointerId)
}

function releasePointer(event: PointerEvent) {
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) canvasRef.value.releasePointerCapture(event.pointerId)
}

function focusCanvas(event: MouseEvent) {
  canvasRef.value?.focus()
  if (event.button === 2) event.preventDefault()
}

onMounted(() => {
  removeInputLock = installEditorInputLock(canvasRef)
  window.addEventListener('keydown', preventBrowserShortcut, true)
  window.addEventListener('tomcat:engine:log', logRuntime)
  window.addEventListener('tomcat:engine:error', logRuntime)
  void start()
})

onBeforeUnmount(() => {
  disposed = true
  removeInputLock?.()
  window.removeEventListener('keydown', preventBrowserShortcut, true)
  window.removeEventListener('tomcat:engine:log', logRuntime)
  window.removeEventListener('tomcat:engine:error', logRuntime)
  try {
    runtime?.shutdown?.()
  } catch {
    // The generated module may not expose shutdown.
  }
})
</script>

<template>
  <div class="runtime-host">
    <canvas
      id="canvas"
      ref="canvasRef"
      tabindex="0"
      aria-label="TomCat Engine WebGL2 editor"
      @pointerdown="capturePointer"
      @pointerup="releasePointer"
      @pointercancel="releasePointer"
      @mousedown="focusCanvas"
      @contextmenu.prevent
      @dragstart.prevent
    />
    <div v-if="error" class="runtime-loading runtime-error">
      <strong>启动失败</strong>
      <span>{{ error }}</span>
    </div>
    <div v-else-if="!ready" class="runtime-loading">
      <strong>TomCat Engine</strong>
      <span>{{ status }}</span>
    </div>
  </div>
</template>

<style scoped>
.runtime-host,
canvas {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: #202020;
}

.runtime-host {
  position: relative;
  color: #d9d9d9;
}

canvas {
  display: block;
  outline: 0;
}
</style>
