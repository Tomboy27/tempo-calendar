import { defineConfig } from 'vite'
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
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    open: true,
    cors: true,
  },
})
