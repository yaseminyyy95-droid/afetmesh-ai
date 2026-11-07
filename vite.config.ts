import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/pwa.ts',
        'src/types.ts',
        'src/**/*.d.ts',
        'src/test/**',
        'src/__tests__/**',
      ],
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 85 },
    },
  },
})
