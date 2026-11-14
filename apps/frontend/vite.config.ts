import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Listen on all network interfaces so teammates on the same network can open http://<your-ip>:5173
  server: { host: true },
})
