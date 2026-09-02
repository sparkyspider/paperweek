import { defineConfig } from 'vitest/config'

/** Minimal config: pure-TS unit tests only (dockPhysics.ts and friends) — no Vue/Nuxt runtime,
 *  no DOM, no plugins. Keep it that way; a component-testing setup is a separate concern this
 *  project hasn't needed yet. */
export default defineConfig({
  test: {
    include: ['app/**/*.spec.ts'],
  },
})
