/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8765',
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
