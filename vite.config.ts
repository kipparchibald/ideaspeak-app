import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@codesandbox/sandpack')) {
            return 'sandpack'
          }
        },
      },
    },
  },
  server: {
    // Local preview writes to .preview-runtime/ — don't let that invalidate the shell's deps
    watch: {
      ignored: ['**/.preview-runtime/**'],
    },
    proxy: {
      // In dev, /api/* proxies to local Bun server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Live preview iframe — real Vite app on :5174
      '/preview': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/preview/, ''),
      },
    },
  },
  define: {
    // Expose API base URL — empty string = same origin (works on Vercel with serverless fns)
    // In local dev, Vite proxy handles /api → localhost:3001
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE || ''),
  },
})
