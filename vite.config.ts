import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Cross-origin isolation enables SharedArrayBuffer → multi-threaded WASM inference.
// Your production host must send these same two headers.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
})
