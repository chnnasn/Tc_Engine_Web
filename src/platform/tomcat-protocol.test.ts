import test from 'node:test'
import assert from 'node:assert/strict'
import { EngineRpcClient, EngineRpcError, TOMCAT_WEB_PROTOCOL, type EngineTransport, type RpcRequest } from './tomcat-protocol.ts'

class EchoTransport implements EngineTransport {
  requests: RpcRequest[] = []

  invoke(serializedRequest: string) {
    const request = JSON.parse(serializedRequest) as RpcRequest
    this.requests.push(request)
    const result = request.type === 'system.capabilities'
      ? { engineBuildId: 'TomCat-1.0.0', protocolVersion: 1, capabilities: ['scene.transactions'] }
      : { revision: 3, dirty: true, selectedEntityId: null }
    return JSON.stringify({ protocol: TOMCAT_WEB_PROTOCOL, requestId: request.requestId, ok: true, result })
  }
}

test('editor RPC preserves uint64 ids as decimal strings', async () => {
  const transport = new EchoTransport()
  const client = new EngineRpcClient(transport)
  const result = await client.transact('18446744073709551615', 2, '移动实体', [{
    op: 'component.patch',
    entityId: '9223372036854775808',
    componentId: '11457157452030541828',
    properties: { '1': [12, 4, 0] },
  }])
  assert.equal(result.revision, 3)
  const payload = transport.requests[0].payload as { operations: Array<{ entityId: string }> }
  assert.equal(payload.operations[0].entityId, '9223372036854775808')
})

test('editor RPC rejects unsafe numeric identities and mismatched replies', async () => {
  const client = new EngineRpcClient(new EchoTransport())
  assert.throws(() => client.sceneSnapshot('18446744073709551616'), /unsigned 64-bit/)

  const bad = new EngineRpcClient({ invoke: () => JSON.stringify({
    protocol: TOMCAT_WEB_PROTOCOL,
    requestId: 'another-request',
    ok: true,
    result: {},
  }) })
  await assert.rejects(() => bad.capabilities(), (error: unknown) =>
    error instanceof EngineRpcError && error.code === 'INVALID_REPLY')
})
