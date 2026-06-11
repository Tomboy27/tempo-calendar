/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: [
      'react-big-calendar',
      'react-big-calendar/lib/addons/dragAndDrop',
      'react-dnd',
      'react-dnd-html5-backend',
    ],
  },
  build: {
    commonjsOptions: {
      include: [/(node_modules)/],
      transformMixedEsModules: true,
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    open: true,
    cors: true,
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/scheduler.ts', 'src/lib/rescheduler.ts'],
    },
  },
})

