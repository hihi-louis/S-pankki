import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser only talks to this server: /api/* is forwarded to the backend. That way a single port
// (5173) is enough to share the app over a tunnel or a network that blocks other ports.
const api = {
  '/api': {
    target: process.env.API_PROXY_TARGET ?? 'http://localhost:3001',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all network interfaces so teammates on the same network can open http://<your-ip>:5173
    host: true,
    // Allow tunnel hostnames such as *.trycloudflare.com (development only)
    allowedHosts: true,
    proxy: api,
  },
  preview: { host: true, allowedHosts: true, proxy: api },
})
