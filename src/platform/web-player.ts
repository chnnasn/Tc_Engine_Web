export interface PlayerModule {
  HEAPU8: Uint8Array
  _malloc(size: number): number
  _free(pointer: number): void
  ccall(name: string, returnType: string | null, argumentTypes: string[], args: unknown[]): unknown
}

export type PlayerModuleFactory = (options: { canvas: HTMLCanvasElement; locateFile: (name: string) => string }) => Promise<PlayerModule>

export interface AnimationClock {
  now(): number
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

const browserClock: AnimationClock = {
  now: () => performance.now(),
  request: callback => requestAnimationFrame(callback),
  cancel: handle => cancelAnimationFrame(handle),
}

export class WebPlayer {
  private module: PlayerModule | null = null
  private frameHandle = 0
  private previousTime = 0

  constructor(
    private readonly factory: PlayerModuleFactory,
    private readonly moduleBaseUrl = '/runtime/player/',
    private readonly clock: AnimationClock = browserClock,
  ) {}

  async start(canvas: HTMLCanvasElement, packageBytes: Uint8Array) {
    if (this.module) throw new Error('播放器已经启动')
    if (!packageBytes.byteLength) throw new Error('Game.tcpak 不能为空')
    const module = await this.factory({ canvas, locateFile: name => new URL(name, location.origin + this.moduleBaseUrl).toString() })
    const pointer = module._malloc(packageBytes.byteLength)
    try {
      module.HEAPU8.set(packageBytes, pointer)
      const status = Number(module.ccall(
        'tc_web_player_boot', 'number', ['number', 'number', 'number', 'number'],
        [canvas.width, canvas.height, pointer, packageBytes.byteLength],
      ))
      if (status !== 0) throw new Error(`播放器启动失败，状态码 ${status}`)
    } finally {
      module._free(pointer)
    }
    this.module = module
    this.previousTime = this.clock.now()
    this.frameHandle = this.clock.request(this.frame)
  }

  resize(width: number, height: number) {
    if (!this.module) return
    this.module.ccall('tc_web_player_resize', null, ['number', 'number'], [width, height])
  }

  stop() {
    if (!this.module) return
    if (this.frameHandle) this.clock.cancel(this.frameHandle)
    this.module.ccall('tc_web_player_shutdown', null, [], [])
    this.module = null
    this.frameHandle = 0
  }

  private readonly frame: FrameRequestCallback = time => {
    if (!this.module) return
    const delta = Math.min(Math.max((time - this.previousTime) / 1000, 0), 0.1)
    this.previousTime = time
    this.module.ccall('tc_web_player_frame', null, ['number'], [delta])
    this.frameHandle = this.clock.request(this.frame)
  }
}
