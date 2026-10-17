import { defineConfig, loadEnv } from 'vite'

/**
 * Share cards need an absolute image URL, built from VITE_SITE_URL.
 *
 * Order of preference:
 *   1. VITE_SITE_URL from .env or the host's environment settings
 *   2. the site URL the host provides at build time (Netlify: URL,
 *      Vercel: VERCEL_PROJECT_PRODUCTION_URL)
 *   3. empty, which leaves the image URL relative (fine for local work)
 */
export default defineConfig(({ mode }) => {
  const explicit = loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const hosted = process.env.URL || (vercel ? `https://${vercel}` : '')
  process.env.VITE_SITE_URL = (explicit || hosted || '').replace(/\/+$/, '')
  return {}
})
