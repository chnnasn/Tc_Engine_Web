export const TOMCAT_WEB_PROTOCOL = 'tomcat.web.v1' as const

export type UInt64String = string
export type SceneRevision = number

export type ComponentValue = boolean | number | string | null | ComponentValue[] | { [key: string]: ComponentValue }

export type EditorOperation =
  | { op: 'entity.create'; entityId: UInt64String; name: string; parentId?: UInt64String }
  | { op: 'entity.delete'; entityId: UInt64String }
  | { op: 'entity.set-parent'; entityId: UInt64String; parentId: UInt64String | null }
  | { op: 'component.add'; entityId: UInt64String; componentId: UInt64String }
  | { op: 'component.remove'; entityId: UInt64String; componentId: UInt64String }
  | { op: 'component.patch'; entityId: UInt64String; componentId: UInt64String; properties: Record<UInt64String, ComponentValue> }

export interface RpcRequest<T = unknown> {
  protocol: typeof TOMCAT_WEB_PROTOCOL
  requestId: string
  type: string
  payload: T
}

export interface RpcSuccess<T = unknown> {
  protocol: typeof TOMCAT_WEB_PROTOCOL
  requestId: string
  ok: true
  result: T
}

export interface RpcFailure {
  protocol: typeof TOMCAT_WEB_PROTOCOL
  requestId: string
  ok: false
  error: { code: string; message: string; details?: unknown }
}

export type RpcReply<T = unknown> = RpcSuccess<T> | RpcFailure

export interface EngineTransport {
  invoke(serializedRequest: string): string | Promise<string>
}

export interface EngineCapabilities {
  engineBuildId: string
  protocolVersion: 1
  capabilities: string[]
}

export interface SceneSnapshot {
  sceneHandle: UInt64String
  revision: SceneRevision
  selectedEntityId: UInt64String | null
  archive: string
}

export interface TransactionResult {
  revision: SceneRevision
  dirty: boolean
  selectedEntityId: UInt64String | null
}

export class EngineRpcError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) {
    super(message)
    this.name = 'EngineRpcError'
  }
}

export class EngineRpcClient {
  private sequence = 0

  constructor(private readonly transport: EngineTransport) {}

  capabilities() {
    return this.call<Record<string, never>, EngineCapabilities>('system.capabilities', {})
  }

  openProject(projectPath: string) {
    return this.call('project.open', { projectPath })
  }

  sceneSnapshot(sceneHandle: UInt64String) {
    assertUInt64(sceneHandle, 'sceneHandle')
    return this.call<{ sceneHandle: UInt64String }, SceneSnapshot>('scene.snapshot', { sceneHandle })
  }

  transact(sceneHandle: UInt64String, baseRevision: SceneRevision, label: string, operations: EditorOperation[]) {
    assertUInt64(sceneHandle, 'sceneHandle')
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) throw new TypeError('baseRevision must be a non-negative safe integer')
    if (!label.trim()) throw new TypeError('label is required')
    if (!operations.length) throw new TypeError('at least one editor operation is required')
    operations.forEach(validateOperation)
    return this.call('scene.transact', { sceneHandle, baseRevision, label, operations }) as Promise<TransactionResult>
  }

  undo(sceneHandle: UInt64String, baseRevision: SceneRevision) {
    return this.history('history.undo', sceneHandle, baseRevision)
  }

  redo(sceneHandle: UInt64String, baseRevision: SceneRevision) {
    return this.history('history.redo', sceneHandle, baseRevision)
  }

  listAssets(projectPath: string) {
    return this.call<{ projectPath: string }, { assets: Array<{ handle: UInt64String; type: string; pathHint: string }> }>(
      'asset.list', { projectPath })
  }

  private history(type: 'history.undo' | 'history.redo', sceneHandle: UInt64String, baseRevision: SceneRevision) {
    assertUInt64(sceneHandle, 'sceneHandle')
    return this.call(type, { sceneHandle, baseRevision }) as Promise<TransactionResult>
  }

  private async call<TPayload, TResult>(type: string, payload: TPayload): Promise<TResult> {
    const requestId = `${Date.now().toString(36)}-${(++this.sequence).toString(36)}`
    const request: RpcRequest<TPayload> = { protocol: TOMCAT_WEB_PROTOCOL, requestId, type, payload }
    let reply: RpcReply<TResult>
    try {
      reply = JSON.parse(await this.transport.invoke(JSON.stringify(request))) as RpcReply<TResult>
    } catch (error) {
      throw new EngineRpcError('INVALID_REPLY', '引擎返回了无法解析的响应', error)
    }
    if (!reply || reply.protocol !== TOMCAT_WEB_PROTOCOL || reply.requestId !== requestId || typeof reply.ok !== 'boolean') {
      throw new EngineRpcError('INVALID_REPLY', '引擎响应与当前请求不匹配')
    }
    if (!reply.ok) throw new EngineRpcError(reply.error.code, reply.error.message, reply.error.details)
    return reply.result
  }
}

function assertUInt64(value: string, name: string) {
  if (!/^(0|[1-9]\d*)$/.test(value) || BigInt(value) > 18_446_744_073_709_551_615n) {
    throw new TypeError(`${name} must be an unsigned 64-bit decimal string`)
  }
}

function validateOperation(operation: EditorOperation) {
  assertUInt64(operation.entityId, 'entityId')
  if ('componentId' in operation) assertUInt64(operation.componentId, 'componentId')
  if ('parentId' in operation && operation.parentId !== undefined && operation.parentId !== null) {
    assertUInt64(operation.parentId, 'parentId')
  }
}

export interface EmscriptenRpcModule {
  ccall(name: string, returnType: string | null, argumentTypes: string[], args: unknown[]): unknown
}

export class EmscriptenEditorTransport implements EngineTransport {
  constructor(private readonly module: EmscriptenRpcModule) {}

  invoke(serializedRequest: string): string {
    const response = this.module.ccall('tc_web_editor_rpc', 'string', ['string'], [serializedRequest])
    if (typeof response !== 'string') throw new EngineRpcError('RPC_UNAVAILABLE', '当前 WASM 未导出 tc_web_editor_rpc')
    return response
  }
}
