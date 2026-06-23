import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:7071',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/uploads/, '/api/uploads'),
      },
    },
    // Vite's file watcher was picking up SQLite's WAL/journal files (written
    // on every single DB query) and other backend output, and triggering a
    // full page reload each time — this is what caused "every click reloads
    // to the main page". None of these are frontend source files.
    watch: {
      ignored: [
        '**/api/**',
        '**/*.db',
        '**/*.db-journal',
        '**/*.db-wal',
        '**/*.db-shm',
      ],
    },
  },
})
