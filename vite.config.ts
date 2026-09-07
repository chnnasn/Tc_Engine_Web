import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function copyWasmRuntime() {
  return {
    name: 'copy-tomcat-wasm-runtime',
    closeBundle() {
      const root = dirname(fileURLToPath(import.meta.url))
      const sourceRuntime = resolve(root, 'wasm/public/runtime')
      const sourceShared = resolve(root, 'wasm/public/shared')
      const outRuntime = resolve(root, 'dist/runtime')
      const outShared = resolve(root, 'dist/shared')
      mkdirSync(outRuntime, { recursive: true })
      mkdirSync(outShared, { recursive: true })
      if (existsSync(sourceRuntime)) {
        for (const file of readdirSync(sourceRuntime)) {
          if (file.endsWith('.html')) continue
          cpSync(resolve(sourceRuntime, file), resolve(outRuntime, file), { recursive: true })
        }
      }
      if (existsSync(sourceShared)) {
        for (const file of ['favicon.svg']) {
          if (existsSync(resolve(sourceShared, file))) cpSync(resolve(sourceShared, file), resolve(outShared, file))
        }
      }
      writeFileSync(resolve(root, 'dist/_redirects'), '/* /index.html 200\n', 'utf8')
    },
  }
}

export default defineConfig({
  publicDir: 'wasm/public',
  plugins: [react(), copyWasmRuntime()],
  build: { outDir: 'dist', emptyOutDir: true },
})
