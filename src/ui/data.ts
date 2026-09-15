export type Game = {
  id: string; title: string; subtitle: string; author: string; category: string;
  image: string; color: string; plays: string; likes: number; duration: string; description: string;
}
export const games: Game[] = [
  { id: 'forest', title: '林间来信', subtitle: '把一封信，送到森林的另一端。', author: '木木工作室', category: '探索', image: '/images/forest.webp', color: '#d8e1d0', plays: '1.2k', likes: 128, duration: '约 15 分钟', description: '背上小小的邮包，走进一座慢下来的森林。沿着溪流寻找路标，和沿途的居民聊聊天，把那封迟到的信送到目的地。没有倒计时，也没有必须完成的任务，按自己的节奏出发就好。' },
  { id: 'puzzle', title: '方寸之间', subtitle: '换一个角度，路就在眼前。', author: '一格', category: '解谜', image: '/images/puzzle.webp', color: '#e4e7e9', plays: '864', likes: 96, duration: '约 20 分钟', description: '旋转、连接、重新观察。在小小的几何世界里，寻找一条通往出口的路。十二个手工设计的关卡，留给你安静思考的空间。' },
  { id: 'desert', title: '日落以后', subtitle: '在最后一缕光里，继续向前。', author: '迟岛', category: '冒险', image: '/images/desert.webp', color: '#e9d3b5', plays: '632', likes: 74, duration: '约 10 分钟', description: '一辆旧车，一片沙漠，一段没有地图的旅途。收集沿途遗落的物件，寻找藏在落日之后的故事。这是一段适合戴上耳机体验的短篇冒险。' },
]
export type Project = { id: string; name: string; template: '2D' | '空白'; image: string; status: 'draft' | 'published'; updated: string; description: string }
export const initialProjects: Project[] = [
  { id: 'my-forest', name: '林间来信', template: '2D', image: '/images/forest.webp', status: 'draft', updated: '今天 14:32', description: '一个关于森林与信件的小故事。' },
  { id: 'my-puzzle', name: '方寸之间', template: '2D', image: '/images/puzzle.webp', status: 'published', updated: '昨天 18:06', description: '试着从另一个角度看世界。' },
  { id: 'my-first-game', name: '我的第一个游戏', template: '空白', image: '', status: 'draft', updated: '9 月 8 日', description: '从一个想法开始。' },
]
export type Topic = { id: string; title: string; category: string; author: string; avatar: string; color: string; time: string; replies: number; content: string; pinned?: boolean }
export const initialTopics: Topic[] = [
  { id: 'welcome', title: '欢迎来到 TomCat，聊聊你想做的第一个游戏', category: '综合讨论', author: 'TomCat', avatar: 'T', color: '#e5ece4', time: '2 小时前', replies: 24, pinned: true, content: '每个游戏都从一个小小的想法开始。也许是一段想讲的故事，也许是一个突然冒出的玩法，或者只是想造一个可以四处走走的世界。\n\n这里是大家交流创作的地方。欢迎分享你的想法，也欢迎从试玩和留言开始。\n\n如果时间、技术都不是问题，你最想做一个什么样的游戏？' },
  { id: 'forest-devlog', title: '《林间来信》开发手记：让森林里多一点生活的痕迹', category: '开发日志', author: '木木', avatar: '木', color: '#ece5d9', time: '36 分钟前', replies: 12, content: '这周没有添加新关卡，而是回头补了一些很小的细节：门口没有收走的鞋子，晾衣绳上的围巾，还有桥边那块总是被踩松的木板。\n\n很有意思的是，这些没有直接参与玩法的物件，反而让这个地方更像有人生活。接下来想试试让居民有自己的小日程。\n\n你们会注意游戏里这些不起眼的细节吗？' },
  { id: 'first-puzzle', title: '第一次做解谜关卡，怎样让提示自然一点？', category: '创作求助', author: '一格', avatar: '一', color: '#e3e8ee', time: '1 小时前', replies: 8, content: '最近在做一个关于视角的解谜原型。自己设计的关卡太熟悉了，很难判断玩家会不会在第一步就卡住。\n\n目前尝试通过颜色和场景里的重复形状来提示，但又担心答案给得太直接。大家通常怎样安排第一个教学关卡？' },
  { id: 'weekend', title: '周末做了个十分钟的小冒险，想听听大家的感受', category: '作品分享', author: '迟岛', avatar: '迟', color: '#f0e4d9', time: '3 小时前', replies: 6, content: '用周末的时间把一直放在备忘录里的沙漠故事做了一个小样。只有三个场景，没有复杂的操作，主要想试试画面和声音一起讲故事。\n\n作品叫《日落以后》。特别想听听大家对结尾的理解，欢迎在这里留下想法。' },
  { id: 'resources', title: '分享一些整理游戏素材的小习惯', category: '经验分享', author: '小北', avatar: '北', color: '#e9e6ee', time: '昨天', replies: 16, content: '以前素材多起来以后，经常找不到上次改过的那张图。现在习惯按用途分目录，再给素材附上一句简单说明。\n\n另一个有帮助的小习惯是保留原始文件，把导出的版本放到独立目录。虽然开始时多了一步，回头调整会轻松很多。' },
]
export const topicCategories = ['全部话题', '综合讨论', '作品分享', '开发日志', '创作求助', '经验分享']
export function uid() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}` }
export function nowLabel() { return new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: Record<string, unknown>, keys: string[]) => keys.every(key => typeof value[key] === 'string')
export const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(x => typeof x === 'string')
export const isProjects = (value: unknown): value is Project[] => Array.isArray(value) && value.every(p => record(p) && strings(p, ['id', 'name', 'image', 'updated', 'description']) && /^[a-zA-Z0-9_-]+$/.test(p.id as string) && ['draft', 'published'].includes(p.status as string) && ['2D', '空白'].includes(p.template as string) && (p.image === '' || games.some(g => g.image === p.image))) && new Set(value.map(p => p.id)).size === value.length
export const isTopics = (value: unknown): value is Topic[] => Array.isArray(value) && value.every(t => record(t) && strings(t, ['id', 'title', 'category', 'author', 'avatar', 'color', 'time', 'content']) && /^[a-zA-Z0-9_-]+$/.test(t.id as string) && typeof t.replies === 'number' && Number.isFinite(t.replies) && t.replies >= 0) && new Set(value.map(t => t.id)).size === value.length
export type LocalComment = { id: string; text: string }
export const isComments = (value: unknown): value is LocalComment[] => Array.isArray(value) && value.every(c => record(c) && strings(c, ['id', 'text']))
export type SceneObject = { id: string; name: string; type: 'sprite' | 'camera' | 'group'; x: number; y: number; rotation: number; scale: number; visible: boolean }
export type Scene = { sceneName: string; objects: SceneObject[]; background: string }
export const isScene = (s: unknown): s is Scene => record(s) && typeof s.sceneName === 'string' && s.sceneName.length <= 64 && typeof s.background === 'string' && (s.background === '' || games.some(g => g.image === s.background)) && Array.isArray(s.objects) && s.objects.length <= 100 && s.objects.every(o => record(o) && strings(o, ['id', 'name']) && (o.name as string).length <= 40 && ['camera', 'sprite', 'group'].includes(o.type as string) && typeof o.visible === 'boolean' && [o.x, o.y, o.rotation, o.scale].every(v => typeof v === 'number' && Number.isFinite(v)) && Math.abs(o.x as number) <= 1000 && Math.abs(o.y as number) <= 1000 && Math.abs(o.rotation as number) <= 360 && (o.scale as number) >= .1 && (o.scale as number) <= 4) && new Set(s.objects.map(o => o.id)).size === s.objects.length
