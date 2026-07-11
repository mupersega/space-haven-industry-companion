import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served from the root of the custom domain (s-h-buddy.com), so
// assets resolve from `/` in both build and dev. public/CNAME pins the domain
// on every deploy. Everything already resolves assets via
// import.meta.env.BASE_URL, so this base is the only wiring the deploy needs.
export default defineConfig(() => ({
  base: '/',
  plugins: [react()],
}))
