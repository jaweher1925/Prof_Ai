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
      // Proxy all /api calls to Azure Functions local emulator (port 7071)
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
      },
      // Proxy /uploads to the api/uploads folder served by the functions host
      '/uploads': {
        target: 'http://localhost:7071',
        changeOrigin: true,
      },
    },
  },
})
