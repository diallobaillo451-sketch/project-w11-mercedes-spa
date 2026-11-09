import { defineConfig } from 'vite'
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  server: { host: '127.0.0.1', port: 5199 },
  preview: { host: '127.0.0.1', port: 4199 },
}))
