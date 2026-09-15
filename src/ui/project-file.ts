import { games, isScene, type Project, type Scene } from './data'

export function exportProject(project: Project, currentScene?: Scene) {
  let scene: Scene | null = currentScene ?? null
  if (!currentScene) {
    try {
      const stored = JSON.parse(localStorage.getItem(`tomcat-ui-scene-${project.id}`) || 'null')
      if (isScene(stored)) scene = stored
    } catch {
      // A metadata export remains available when scene storage is unavailable.
    }
  }
  const blob = new Blob([
    JSON.stringify({ format: 'tomcat-static-project', version: 1, project, scene }, null, 2),
  ], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${project.name.replace(/[<>:"/\\|?*]/g, '-')}.tomcat.json`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readProjectFile(file: File): Promise<{ project: Omit<Project, 'id' | 'updated'>; scene: Scene | null }> {
  if (file.size > 2_000_000) throw new Error('size')
  const data: unknown = JSON.parse(await file.text())
  if (!isRecord(data) || data.format !== 'tomcat-static-project' || data.version !== 1 ||
      !isRecord(data.project) || typeof data.project.name !== 'string' || !data.project.name.trim()) {
    throw new Error('format')
  }
  const raw = data.project
  const scene = data.scene == null ? null : data.scene
  if (scene !== null && !isScene(scene)) throw new Error('scene')
  return {
    project: {
      name: String(raw.name).trim().slice(0, 32),
      template: raw.template === '2D' ? '2D' : '空白',
      image: games.some(game => game.image === raw.image) ? String(raw.image) : '',
      status: 'draft',
      description: typeof raw.description === 'string' ? raw.description.slice(0, 300) : '',
    },
    scene,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
