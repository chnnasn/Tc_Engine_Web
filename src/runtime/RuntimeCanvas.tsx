import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window { TomCatEngineHost?: any; TomCatWebModule?: any; TomCatRuntime?: any; TomCatRuntimeReady?: Promise<unknown>; TomCatStore?: any; Module?: any; }
}

const scriptLoads = new Map<string, Promise<void>>();
const loadScript = (src: string) => {
  const existing = scriptLoads.get(src);
  if (existing) return existing;
  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = src; script.async = false;
    script.onload = () => resolve(); script.onerror = () => { scriptLoads.delete(src); reject(new Error(`资源加载失败：${src}`)); }; document.head.appendChild(script);
  });
  scriptLoads.set(src, pending);
  return pending;
};

export type RuntimeCanvasProps = { project?: any; onReady?: (runtime: any) => void; onError?: (error: Error) => void };

/** React host for the upstream Emscripten editor. The C++/WASM module remains untouched. */
export default function RuntimeCanvas({ project, onReady, onError }: RuntimeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('正在加载上游编辑器…');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false; let runtime: any;
    const preventBrowserShortcut = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const key = event.key.toLowerCase();
      const modified = event.ctrlKey || event.metaKey;
      const upstreamShortcut = modified && ['n', 'o', 's', 'd', 'z', 'y'].includes(key);
      const browserShortcut = (modified && ['p', 'r'].includes(key)) || event.key === 'F5' || (event.altKey && ['arrowleft', 'arrowright', 'home'].includes(key));
      if (upstreamShortcut || browserShortcut || event.key === 'Backspace' || event.key === 'Tab') event.preventDefault();
    };
    const params = new URLSearchParams(location.search);
    const raw = project || window.TomCatStore?.get?.(params.get('project') || localStorage.getItem('tomcat.lastProjectId') || '') || window.TomCatStore?.list?.()[0] || { id: 'MainScene', name: 'MainScene' };
    document.title = `${raw.name || 'TomCat Engine'} · TomCat Engine`;
    const start = async () => {
      try {
        if (!window.TomCatEngineHost) throw new Error('React 运行时适配器未初始化');
        if (typeof window.TomCatWebModule !== 'function') await loadScript('/runtime/tomcat_web_module.js?v=20260907-cjk');
        if (disposed) return;
        if (!window.TomCatEngineHost || typeof window.TomCatEngineHost.EngineRuntime !== 'function') throw new Error('EngineRuntime 未找到');
        if (!canvasRef.current) throw new Error('Canvas 未挂载');
        runtime = new window.TomCatEngineHost.EngineRuntime({ canvas: canvasRef.current, project: raw });
        window.TomCatRuntime = runtime; window.TomCatRuntimeReady = runtime.ready;
        runtime.ready.then(() => { if (disposed) { runtime?.shutdown?.(); return; } setReady(true); setStatus(`上游 EditorLayer · WebGL2 · ${raw.name || 'TomCat Engine'}`); onReady?.(runtime); canvasRef.current?.focus(); }).catch((e: Error) => { if (!disposed) { setError(e.message); onError?.(e); } });
      } catch (e) { const cause = e instanceof Error ? e : new Error(String(e)); if (!disposed) { setError(cause.message); onError?.(cause); } }
    };
    const log = (event: Event) => setStatus(String((event as CustomEvent).detail || ''));
    window.addEventListener('keydown', preventBrowserShortcut, true);
    window.addEventListener('tomcat:engine:log', log); window.addEventListener('tomcat:engine:error', log); start();
    return () => { disposed = true; window.removeEventListener('keydown', preventBrowserShortcut, true); window.removeEventListener('tomcat:engine:log', log); window.removeEventListener('tomcat:engine:error', log); try { runtime?.shutdown?.(); } catch { /* module may not expose shutdown */ } };
  }, [project, onError, onReady]);
  return <div className="runtime-host" style={{ width: '100%', height: '100%', margin: 0, overflow: 'hidden', background: '#202020', color: '#d9d9d9' }}><canvas ref={canvasRef} id="canvas" tabIndex={0} aria-label="TomCat Engine WebGL2 editor" onPointerDown={(event) => { canvasRef.current?.focus(); canvasRef.current?.setPointerCapture(event.pointerId); }} onPointerUp={(event) => { if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId); }} onPointerCancel={(event) => { if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId); }} onMouseDown={() => canvasRef.current?.focus()} onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} style={{ width: '100%', height: '100%', display: 'block', outline: 0 }} />{error ? <div className="runtime-loading runtime-error"><strong>启动失败</strong><span>{error}</span></div> : !ready && <div className="runtime-loading"><strong>TomCat Engine</strong><span>{status}</span></div>}</div>;
}
