<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { installEditorInputLock } from './editor-input-lock'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const status = ref('正在加载上游 TomCat Hub…')
const error = ref<string | null>(null)
const ready = ref(false)
const moduleLoad = new Map<string, Promise<void>>()

let disposed = false
let runtime: { ready: Promise<unknown>; shutdown?: () => void } | undefined
let removeInputLock: (() => void) | undefined

function loadModule() {
  const src = '/runtime/tomcat_web_module.js?v=20260907-cjk'
  const current = moduleLoad.get(src)
  if (current) return current

  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => {
      moduleLoad.delete(src)
      reject(new Error('WASM Hub 模块加载失败'))
    }
    document.head.appendChild(script)
  })
  moduleLoad.set(src, pending)
  return pending
}

function preventBrowserShortcut(event: KeyboardEvent) {
  if (document.activeElement !== canvasRef.value || event.isComposing) return
  const key = event.key.toLowerCase()
  const modified = event.ctrlKey || event.metaKey
  const browserShortcut = modified && ['n', 'o', 'p', 'r', 's', 'd', 'z', 'y'].includes(key)
  const browserNavigation = event.altKey && ['arrowleft', 'arrowright', 'home'].includes(key)
  if (browserShortcut || browserNavigation || event.key === 'F5' || event.key === 'Backspace' || event.key === 'Tab') event.preventDefault()
}

async function start() {
  try {
    await loadModule()
    if (disposed) return
    if (!window.TomCatEngineHost?.HubRuntime || typeof window.TomCatWebModule !== 'function') {
      throw new Error('Vue Hub 运行时未初始化')
    }
    if (!canvasRef.value) throw new Error('Hub Canvas 未挂载')
    const hub = new window.TomCatEngineHost.HubRuntime({ canvas: canvasRef.value, modulePath: '/runtime/' })
    runtime = hub
    window.TomCatHubRuntime = hub
    await hub.ready
    if (disposed) {
      hub.shutdown?.()
      return
    }
    ready.value = true
    status.value = '上游 ExampleLayer · TomCat Hub · WebGL2'
    canvasRef.value.focus()
  } catch (reason) {
    if (!disposed) error.value = reason instanceof Error ? reason.message : String(reason)
  }
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
  void start()
})

onBeforeUnmount(() => {
  disposed = true
  removeInputLock?.()
  window.removeEventListener('keydown', preventBrowserShortcut, true)
  try {
    runtime?.shutdown?.()
  } catch {
    // Older generated modules may not expose shutdown.
  }
  window.TomCatHubRuntime = undefined
})
</script>

<template>
  <main class="runtime-page">
    <canvas
      ref="canvasRef"
      tabindex="0"
      aria-label="TomCat Hub Dear ImGui WebGL2"
      @pointerdown="capturePointer"
      @pointerup="releasePointer"
      @pointercancel="releasePointer"
      @mousedown="focusCanvas"
      @contextmenu.prevent
      @dragstart.prevent
    />
    <div v-if="error" class="runtime-loading runtime-error">
      <strong>TomCat Hub 启动失败</strong>
      <span>{{ error }}</span>
    </div>
    <div v-else-if="!ready" class="runtime-loading">
      <strong>TomCat Hub</strong>
      <span>{{ status }}</span>
    </div>
  </main>
</template>
