import tailwindcss from '@tailwindcss/vite'

// The Snag switch the satellite converter writes (`snag: { enabled: false, … }` below) is typed
// by @co-sy/snag, which Paperweek does not install. Declared here so the switch stays written,
// off and inert, and the config still typechecks.
declare module 'nuxt/schema' {
  interface NuxtConfig {
    snag?: { enabled: boolean; slug: string; apiBase: string }
  }
}

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
  modules: ['@co-sy/satellite-auth', '@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  // Components live under planner/, sidebar/, shared/ but are used by their bare filename
  // (<WeekRow>, <ThemeCard>, …) — explicit `pathPrefix: false` so Nuxt never folder-prefixes
  // them (e.g. <PlannerWeekRow>), regardless of the scaffold-version default.
  components: [{ path: '~/components', pathPrefix: false }],
  // Stale-tab self-healing (co-sy convention): a build that has moved on from under an open
  // tab must not render blank on the next client-side navigation — reload to the same route.
  experimental: { emitRouteChunkError: 'automatic' },
  // The planner is entirely auth-gated client state (the Co-Sy session lives in the browser) —
  // SSR-ing it and then redirecting client-side would hydration-mismatch.
  routeRules: {
    '/': { ssr: false, headers: securityHeaders },
    // The old email + password page is gone: sign-in is Co-Sy's. An old bookmark lands on the
    // planner, whose `cosy-auth` middleware sends a signed-out person to Co-Sy's sign-in.
    '/login': { redirect: '/' },
    '/**': { headers: securityHeaders },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    public: {
      // Paperweek's own API (`/api/*`), behind the Co-Sy satellite guard. Override via
      // NUXT_PUBLIC_BACKEND_BASE (build time or run time).
      // 3101 was Mark's pre-existing co-sy "board" launchd service — this app lives on 3201.
      backendBase: env.NUXT_PUBLIC_BACKEND_BASE || 'http://localhost:3201',
    },
  },
  // ───────────────────────────────────────────────────────────────────────────
  // co-sy satellite (managed by satellite-app-converter, 2026-10-19 10:09:44 SAST)
  // People sign in to this app with their Co-Sy account. The module registers
  // /auth/callback itself — this app creates no callback page — and its route
  // middleware refuses anyone without `requiredRole`, read ONLY from the keyed
  // claim urn:zitadel:iam:org:project:395776530166317058:roles.
  // There is no client secret here, and there never is one: the login
  // application is PKCE.
  // ───────────────────────────────────────────────────────────────────────────
  cosySatellite: {
    slug: 'paperweek',
    // What people know the app as; the refusal page names it.
    name: 'Paperweek',
    // Read at BUILD time (the sign-in scopes are built from the two project ids), so a
    // production image is built with its own values; the literals are the local defaults the
    // converter wrote, from Co-Sy's satellite:register on 2026-10-19.
    issuer: env.COSY_ISSUER || 'http://localhost:8080',
    clientId: env.COSY_SATELLITE_CLIENT_ID || '395776530585747458',
    satelliteProjectId: env.COSY_SATELLITE_PROJECT_ID || '395776530166317058',
    cosyProjectId: env.COSY_PROJECT_ID || '392299905571356674',
    cosyApiBase: env.COSY_API_BASE || 'http://localhost:3051/api',
    requiredRole: 'PAPERWEEK_USER',
    callbackPath: '/auth/callback',
    postLogoutPath: '/',
    enabled: true,
  },
  // The Snag-reports switch (084). `enabled: false` registers nothing at all —
  // the same early return @co-sy/snag uses, so off is off in the bundle and not
  // a runtime `if`. The toggle a PERSON sees is another task; this is the hook
  // it will flip. @co-sy/snag is only named in `modules` when it is installed.
  snag: { enabled: false, slug: 'paperweek', apiBase: 'http://localhost:3051/api' },
})
