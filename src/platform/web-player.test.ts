import test from 'node:test'
import assert from 'node:assert/strict'
import { WebPlayer, type AnimationClock, type PlayerModule } from './web-player.ts'

test('web player copies a tcpak, boots, advances frames and shuts down', async () => {
  const calls: Array<{ name: string; args: unknown[] }> = []
  let callback: FrameRequestCallback | null = null
  const clock: AnimationClock = {
    now: () => 1000,
    request: next => { callback = next; return 7 },
    cancel: handle => assert.equal(handle, 7),
  }
  const memory = new Uint8Array(32)
  const module: PlayerModule = {
    HEAPU8: memory,
    _malloc: () => 8,
    _free: pointer => assert.equal(pointer, 8),
    ccall: (name, _returnType, _argumentTypes, args) => {
      calls.push({ name, args })
      return name === 'tc_web_player_boot' ? 0 : undefined
    },
  }
  const player = new WebPlayer(async () => module, '/runtime/player/', clock)
  await player.start({ width: 1280, height: 720 } as HTMLCanvasElement, Uint8Array.from([1, 2, 3]))
  assert.deepEqual([...memory.slice(8, 11)], [1, 2, 3])
  assert.deepEqual(calls[0], { name: 'tc_web_player_boot', args: [1280, 720, 8, 3] })
  assert.ok(callback)
  ;(callback as FrameRequestCallback)(1016)
  assert.equal(calls[1].name, 'tc_web_player_frame')
  assert.equal(calls[1].args[0], 0.016)
  player.stop()
  assert.equal(calls.at(-1)?.name, 'tc_web_player_shutdown')
})
