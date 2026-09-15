import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig({
  publicDir: 'public',
  plugins: [vue(), {
    name: 'static-spa-fallback',
    apply: 'build',
    closeBundle() { writeFileSync(resolve('dist/_redirects'), '/* /index.html 200\n', 'utf8') },
  }],
  build: { outDir: 'dist', emptyOutDir: true },
})
