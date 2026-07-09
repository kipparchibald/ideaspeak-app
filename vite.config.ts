import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // In dev, /api/* proxies to local Bun server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  define: {
    // Expose API base URL — empty string = same origin (works on Vercel with serverless fns)
    // In local dev, Vite proxy handles /api → localhost:3001
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE || ''),
  },
})
