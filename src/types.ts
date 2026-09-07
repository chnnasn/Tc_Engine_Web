export type AssetKind = 'scene' | 'texture' | 'script' | 'audio' | 'file'
export interface Asset { id: string; name: string; type: string; kind: AssetKind; size: number; status: string; path: string }
export interface Scene { id: string; name: string; modified: string; entities: unknown[] }
export interface Activity { text: string; time: string; icon?: string }
export interface Project { id: string; name: string; template: string; description: string; color: string; status: string; created: string; updated: string; assets: Asset[]; scenes: Scene[]; activity: Activity[] }
