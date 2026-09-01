import tailwindcss from '@tailwindcss/vite'

// Node env without node typings: this config only ever runs under Node, where
// globalThis.process is always present.
const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } })
    .process?.env ?? {}

// Protective response headers on every route (co-sy convention: the front's half of a
// bundle the back mirrors on its own middleware). Anti-framing is the load-bearing pair.
const securityHeaders: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  devServer: { port: 3200 },
  app: {
    head: {
      title: 'Paperweek',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Inter:wght@400;500;600&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap',
        },
        {
          rel: 'icon',
          type: 'image/svg+xml',
          // A tiny hand-painted ink dot — no build-time asset pipeline needed for a favicon.
          href: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2213%22 fill=%22%23f7f3ea%22/%3E%3Cpath d=%22M11 20c1-6 3-10 5-12 2 2 4 6 5 12-2 2-8 2-10 0z%22 fill=%22%233a5a8c%22 opacity=%220.85%22/%3E%3C/svg%3E',
        },
      ],
    },
  },
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  // Components live under planner/, sidebar/, shared/ but are used by their bare filename
  // (<WeekRow>, <ThemeCard>, …) — explicit `pathPrefix: false` so Nuxt never folder-prefixes
  // them (e.g. <PlannerWeekRow>), regardless of the scaffold-version default.
  components: [{ path: '~/components', pathPrefix: false }],
  // Stale-tab self-healing (co-sy convention): a build that has moved on from under an open
  // tab must not render blank on the next client-side navigation — reload to the same route.
  experimental: { emitRouteChunkError: 'automatic' },
  // The planner is entirely auth-gated client state (JWT lives in memory only) — SSR-ing it
  // and then redirecting client-side would hydration-mismatch. Mirrors co-sy's `/app/**` rule.
  routeRules: {
    '/': { ssr: false, headers: securityHeaders },
    '/**': { headers: securityHeaders },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    public: {
      // Single backend origin — the BFF's `/auth/*` and the API's `/api/*` both live here,
      // same convention as co-sy's `apiBase`. Override via NUXT_PUBLIC_BACKEND_BASE.
      // 3101 was Mark's pre-existing co-sy "board" launchd service — this app lives on 3201.
      backendBase: env.NUXT_PUBLIC_BACKEND_BASE || 'http://localhost:3201',
    },
  },
})
