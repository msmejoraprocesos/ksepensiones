import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    globals: true,
    setupFiles: ['__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['lib/**', 'app/api/**'],
    },
  },
})
