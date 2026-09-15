export interface ProjectRevisionPayload {
  schemaVersion: 1
  project: string
  settings: Record<string, string>
  scenes: Record<string, string>
  assets: Array<{ handle: string; contentHash: string; uploadId: string }>
}

export interface SavedRevision {
  projectId: string
  revisionId: string
  etag: string
  createdAt: string
}

export interface PublishedRelease {
  releaseId: string
  slug: string
  revisionId: string
  status: 'queued' | 'building' | 'ready' | 'failed'
}

export class CloudConflictError extends Error {
  constructor(public readonly currentEtag: string | null) {
    super('云端项目已被其他编辑会话更新')
    this.name = 'CloudConflictError'
  }
}

export class TomCatCloudClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async saveRevision(projectId: string, payload: ProjectRevisionPayload, baseEtag?: string): Promise<SavedRevision> {
    const response = await this.fetcher(this.url(`/v1/projects/${encodeURIComponent(projectId)}/revisions`), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(baseEtag ? { 'If-Match': baseEtag } : { 'If-None-Match': '*' }),
      },
      body: JSON.stringify(payload),
    })
    if (response.status === 409 || response.status === 412) {
      throw new CloudConflictError(response.headers.get('ETag'))
    }
    return this.read<SavedRevision>(response)
  }

  async publish(projectId: string, revisionId: string): Promise<PublishedRelease> {
    const response = await this.fetcher(this.url(`/v1/projects/${encodeURIComponent(projectId)}/releases`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisionId, target: 'web' }),
    })
    return this.read<PublishedRelease>(response)
  }

  async release(releaseId: string): Promise<PublishedRelease> {
    return this.read(await this.fetcher(this.url(`/v1/releases/${encodeURIComponent(releaseId)}`), {
      credentials: 'include',
    }))
  }

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`
  }

  private async read<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`云端请求失败 (${response.status})${detail ? `：${detail}` : ''}`)
    }
    return response.json() as Promise<T>
  }
}
