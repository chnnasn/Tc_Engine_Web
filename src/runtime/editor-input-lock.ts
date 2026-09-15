import type { Ref } from 'vue'

/**
 * Keep browser defaults out of the WebGL editor while its canvas owns focus.
 *
 * The GLFW bridge still receives every event because these listeners only
 * cancel the browser default; they deliberately do not stop propagation.
 */
export function installEditorInputLock(canvasRef: Ref<HTMLCanvasElement | null>) {
  const isOwned = (event: Event) => {
    const canvas = canvasRef.value
    if (!canvas) return false
    const target = event.target
    return document.activeElement === canvas || target === canvas || (target instanceof Node && canvas.contains(target))
  }

  const cancelBrowserDefault = (event: Event) => {
    if (!isOwned(event) || !event.cancelable) return
    event.preventDefault()
  }

  // Capture on window so this runs before page-level handlers and browser
  // defaults, while allowing Emscripten's own capture listeners to continue.
  const events = [
    'keydown', 'keypress', 'keyup', 'beforeinput',
    'mousedown', 'mouseup', 'auxclick', 'contextmenu',
    'wheel', 'mousewheel', 'selectstart', 'dragstart', 'dragover', 'drop',
    'gesturestart', 'gesturechange', 'gestureend',
  ]
  for (const type of events) window.addEventListener(type, cancelBrowserDefault, true)

  return () => {
    for (const type of events) window.removeEventListener(type, cancelBrowserDefault, true)
  }
}
