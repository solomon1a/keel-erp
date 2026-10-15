import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 43123,
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:43124',
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 30000,
  },
})
