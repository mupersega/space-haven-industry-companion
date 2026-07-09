import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves a project site from /<repo>/, so production assets need
// that base path. Dev keeps `/` so `vite dev` (and any parallel session) is
// unaffected. Everything already resolves assets via import.meta.env.BASE_URL,
// so this is the only wiring the deploy needs.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/space-haven-industry-companion/' : '/',
  plugins: [react()],
}))
