import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    TomCatWebModule?: any
    TomCatEngineHost?: any
    TomCatHubRuntime?: unknown
  }
}

const moduleLoad = new Map<string, Promise<void>>()
function loadModule() {
  const src = '/runtime/tomcat_web_module.js?v=20260907-cjk'
  const current = moduleLoad.get(src)
  if (current) return current
  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => { moduleLoad.delete(src); reject(new Error('WASM Hub 模块加载失败')) }
    document.head.appendChild(script)
  })
  moduleLoad.set(src, pending)
  return pending
}

export default function HubCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('正在加载上游 TomCat Hub…')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let disposed = false
    let runtime: { ready: Promise<unknown>; shutdown?: () => void } | undefined
    const preventBrowserShortcut = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const key = event.key.toLowerCase()
      const modified = event.ctrlKey || event.metaKey
      const browserShortcut = modified && ['n', 'o', 'p', 'r', 's', 'd', 'z', 'y'].includes(key)
      const browserNavigation = event.altKey && ['arrowleft', 'arrowright', 'home'].includes(key)
      if (browserShortcut || browserNavigation || event.key === 'F5' || event.key === 'Backspace' || event.key === 'Tab') event.preventDefault()
    }
    const start = async () => {
      try {
        await loadModule()
        if (disposed) return
        if (!window.TomCatEngineHost?.HubRuntime || typeof window.TomCatWebModule !== 'function') throw new Error('React Hub 运行时未初始化')
        if (!canvasRef.current) throw new Error('Hub Canvas 未挂载')
        const hub = new window.TomCatEngineHost.HubRuntime({ canvas: canvasRef.current, modulePath: '/runtime/' })
        runtime = hub
        window.TomCatHubRuntime = hub
        await hub.ready
        if (disposed) { hub.shutdown?.(); return }
        setReady(true)
        setStatus('上游 ExampleLayer · TomCat Hub · WebGL2')
        canvasRef.current.focus()
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason))
      }
    }
    window.addEventListener('keydown', preventBrowserShortcut, true)
    start()
    return () => { disposed = true; window.removeEventListener('keydown', preventBrowserShortcut, true); try { runtime?.shutdown?.() } catch { /* best effort */ } window.TomCatHubRuntime = undefined }
  }, [])

  return <main className="runtime-page">
    <canvas ref={canvasRef} tabIndex={0} aria-label="TomCat Hub Dear ImGui WebGL2" onPointerDown={(event) => { canvasRef.current?.focus(); canvasRef.current?.setPointerCapture(event.pointerId); }} onPointerUp={(event) => { if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId); }} onPointerCancel={(event) => { if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId); }} onMouseDown={() => canvasRef.current?.focus()} onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} />
    {error ? <div className="runtime-loading runtime-error"><strong>TomCat Hub 启动失败</strong><span>{error}</span></div> : !ready && <div className="runtime-loading"><strong>TomCat Hub</strong><span>{status}</span></div>}
  </main>
}
