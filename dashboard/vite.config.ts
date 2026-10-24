import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Served by the Fastify server at /admin (same origin as the API → simple, secure cookies).
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../server/public/admin', emptyOutDir: true },
  server: {
    port: 5174,
    // in dev, forward API calls to the local Fastify server
    proxy: { '/v1': 'http://localhost:8080' },
  },
})
