#!/usr/bin/env node
// view-website: verify the login page renders the right error text when the BACKEND says
// "Zitadel unreachable" (503, real envelope) vs. when the BACKEND itself never answers at all
// (network failure). Intercepts POST http://localhost:3201/auth/login with page.route() so no
// real request ever reaches back/ or Zitadel — the running dev servers are untouched.
//
// Usage: node login-unreachable.mjs <outDir>
//   writes <outDir>/login-503.png + <outDir>/login-neterr.png and prints a JSON summary of
//   the rendered error text for both scenarios.
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const outDir = resolve(process.argv[2] || '.')

const LOGIN_URL = 'http://localhost:3200/login'
const BACKEND_LOGIN = 'http://localhost:3201/auth/login'

const SERVICE_UNAVAILABLE_MESSAGE =
  'Sign-in service is unreachable. Check that Zitadel is running (Docker) and try again.'
const NETWORK_ERROR_MESSAGE = "Can't reach the Paperweek server. Is the back end running?"

async function runScenario(browser, { name, screenshotPath, routeHandler }) {
  const page = await browser.newPage({ viewport: { width: 480, height: 640 } })
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.route(BACKEND_LOGIN, routeHandler)

  const resp = await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.fill('input[type="email"]', 'mark@co-sy.org')
  await page.fill('input[type="password"]', 'whatever-password')
  await page.click('button[type="submit"]')

  // Wait for the error paragraph to appear (post-submit, pending resolves).
  const errorLocator = page.locator('form p')
  await errorLocator.waitFor({ state: 'visible', timeout: 10000 })
  const errorText = (await errorLocator.textContent())?.trim() ?? null

  await page.screenshot({ path: screenshotPath, fullPage: false })
  await page.close()

  return {
    scenario: name,
    httpStatus: resp ? resp.status() : null,
    screenshot: screenshotPath,
    renderedErrorText: errorText,
    consoleErrors,
    pageErrors,
  }
}

const browser = await chromium.launch({ headless: true })
try {
  const results = []

  // Scenario 1: back/ answers with a 503, carrying the back's real envelope shape.
  results.push(
    await runScenario(browser, {
      name: '503-zitadel-unreachable',
      screenshotPath: resolve(outDir, 'login-503.png'),
      routeHandler: (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            meta: { status: 'error', code: 503, requestId: 'test-req-503' },
            error: { code: 'SERVICE_UNAVAILABLE', message: SERVICE_UNAVAILABLE_MESSAGE },
          }),
        }),
    }),
  )

  // Scenario 2: total network failure reaching back/ — no response at all.
  results.push(
    await runScenario(browser, {
      name: 'network-failure-reaching-back',
      screenshotPath: resolve(outDir, 'login-neterr.png'),
      routeHandler: (route) => route.abort('connectionrefused'),
    }),
  )

  const summary = results.map((r) => ({
    ...r,
    expected:
      r.scenario === '503-zitadel-unreachable' ? SERVICE_UNAVAILABLE_MESSAGE : NETWORK_ERROR_MESSAGE,
    matches:
      r.renderedErrorText ===
      (r.scenario === '503-zitadel-unreachable' ? SERVICE_UNAVAILABLE_MESSAGE : NETWORK_ERROR_MESSAGE),
  }))

  console.log(JSON.stringify(summary, null, 2))
  const allMatch = summary.every((s) => s.matches)
  if (!allMatch) process.exitCode = 1
} finally {
  await browser.close()
}
