import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudConflictError, TomCatCloudClient, type ProjectRevisionPayload } from './cloud-client.ts'

const payload: ProjectRevisionPayload = {
  schemaVersion: 1,
  project: 'SchemaVersion: 4',
  settings: { 'BuildSettings.json': '{}' },
  scenes: { '1001': 'Scene: Main' },
  assets: [],
}

test('cloud save uses optimistic concurrency and publishes an immutable revision', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init })
    const body = requests.length === 1
      ? { projectId: 'p1', revisionId: 'r2', etag: '"r2"', createdAt: '2026-09-15T00:00:00Z' }
      : { releaseId: 'rel1', slug: 'demo', revisionId: 'r2', status: 'queued' }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const client = new TomCatCloudClient('https://api.example.test/', fetcher)
  const revision = await client.saveRevision('p1', payload, '"r1"')
  const release = await client.publish('p1', revision.revisionId)
  assert.equal(new Headers(requests[0].init?.headers).get('If-Match'), '"r1"')
  assert.equal(JSON.parse(String(requests[1].init?.body)).revisionId, 'r2')
  assert.equal(release.status, 'queued')
})

test('cloud save exposes revision conflicts instead of overwriting', async () => {
  const client = new TomCatCloudClient('https://api.example.test', async () =>
    new Response('', { status: 412, headers: { ETag: '"r9"' } }))
  await assert.rejects(() => client.saveRevision('p1', payload, '"r1"'), (error: unknown) =>
    error instanceof CloudConflictError && error.currentEtag === '"r9"')
})
