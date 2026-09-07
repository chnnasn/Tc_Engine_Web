import type { Asset, AssetKind, Project } from './types'

const KEY = 'tomcat.platform.v1'
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
const now = () => new Date().toISOString()
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const typeFor = (name = '') => { const ext = name.toLowerCase().split('.').pop(); if (['png','jpg','jpeg','webp','svg'].includes(ext || '')) return '纹理'; if (['lua','js','ts','cpp','h'].includes(ext || '')) return '脚本'; if (['tomcat','tcproj','scene'].includes(ext || '')) return '场景'; if (['wav','mp3','ogg'].includes(ext || '')) return '音频'; return '文件' }
const kindFor = (name: string): AssetKind => ({纹理:'texture',脚本:'script',场景:'scene',音频:'audio'} as Record<string, AssetKind>)[typeFor(name)] || 'file'
const scene = (name: string): any => ({ id: uid('scene'), name, modified: now(), entities: [{ id: uid('entity'), name: 'Main Camera', type: 'Camera', visible: true }] })
const seed = (): Project[] => ['星际农场','霓虹街区','纸片人冒险'].map((name, i) => ({ id:`p${i+1}`, name, template: i===1?'平台跳跃':i===2?'俯视角冒险':'2D 空项目', description: i===1?'平台、角色和碰撞器已经就位。':i===2?'俯视角关卡原型。':'从一个可运行的 2D 场景开始。', color:i===1?'green':i===2?'orange':'', status:'ready', created:now(), updated:now(), assets:[{id:uid('asset'),name:i===1?'Level01.tomcat':i===2?'World.tomcat':'MainScene.tomcat',type:'场景',kind:'scene',size:18432,status:'已同步',path:'Scenes/MainScene.tomcat'}], scenes:[scene(i===1?'Level01':i===2?'World':'MainScene')], activity:[{text:'创建了项目',time:'刚刚',icon:'＋'}]}))
const read = (): Project[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(v) && v.length) return v; } catch {} const v = seed(); localStorage.setItem(KEY, JSON.stringify(v)); return v }
let projects = read()
const persist = () => localStorage.setItem(KEY, JSON.stringify(projects))
const normalize = (p: Partial<Project>): Project => ({ id:p.id||uid('project'), name:String(p.name||'Untitled Project').trim()||'Untitled Project', template:p.template||'2D 空项目', description:p.description||'', color:p.color||'', status:p.status||'ready', created:p.created||now(), updated:p.updated||now(), assets:p.assets||[], scenes:p.scenes?.length?p.scenes:[scene('MainScene')], activity:p.activity||[] })
export const store = {
  uid,
  typeFor,
  kindFor,
  list: () => clone(projects), get: (id: string) => clone(projects.find(p => p.id===id || p.name===id) || null),
  create(input: {name: string; template: string; description?: string; color?: string}) { const n=input.name.trim(); if (!n) throw Error('项目名称不能为空'); if(projects.some(p=>p.name.toLowerCase()===n.toLowerCase())) throw Error('项目名称已存在'); const p=normalize({...input,id:uid('project'),name:n,assets:[],activity:[{text:'创建了项目',time:'刚刚',icon:'＋'}]}); projects.unshift(p); persist(); return clone(p) },
  update(id: string, patch: Partial<Project>) { const i=projects.findIndex(p=>p.id===id); if(i<0) return null; projects[i]=normalize({...projects[i],...patch,updated:now()}); persist(); return clone(projects[i]) },
  rename(id:string,name:string) { if(projects.some(p=>p.id!==id&&p.name.toLowerCase()===name.toLowerCase())) throw Error('项目名称已存在'); return this.update(id,{name:name.trim()}) },
  remove(id:string) { const before=projects.length; projects=projects.filter(p=>p.id!==id); persist(); return projects.length<before },
  duplicate(id:string) { const p=projects.find(x=>x.id===id); if(!p) return null; let name=`${p.name} 副本`,n=2; while(projects.some(x=>x.name===name)) name=`${p.name} 副本 ${n++}`; const c=normalize({...clone(p),id:uid('project'),name,created:now(),updated:now(),activity:[{text:`复制自 ${p.name}`,time:'刚刚',icon:'⧉'}]}); projects.unshift(c); persist(); return clone(c) },
  addAsset(id:string,file: {name:string;size:number;type?:string}) { const p=projects.find(x=>x.id===id); if(!p)return null; const a:Asset={id:uid('asset'),name:file.name,type:file.type||typeFor(file.name),kind:kindFor(file.name),size:file.size||0,status:'本地',path:`Assets/${file.name}`}; p.assets.push(a);p.updated=now();persist();return clone(a) },
  removeAsset(pid:string,aid:string) { const p=projects.find(x=>x.id===pid);if(!p)return false; const n=p.assets.length;p.assets=p.assets.filter(a=>a.id!==aid);persist();return p.assets.length<n },
  saveScene(projectId:string, sceneValue:any) { const p=projects.find(x=>x.id===projectId); if(!p) return null; const index=p.scenes.findIndex(s=>s.id===sceneValue.id); if(index<0)p.scenes.push(clone(sceneValue)); else p.scenes[index]=clone(sceneValue); p.updated=now(); persist(); return clone(p) },
  createScene(projectId:string, name='NewScene') { const p=projects.find(x=>x.id===projectId); if(!p)return null; const s=scene(name); p.scenes.push(s); p.updated=now(); persist(); return clone(s) }
}
