import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    // Ensure HMR and URLs also use 127.0.0.1
    hmr: { host: '127.0.0.1' },
  },
  preview: {
    host: '127.0.0.1',
  },
})
