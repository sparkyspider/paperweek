#!/usr/bin/env node
// view-website: screenshot authenticated pages in Paperweek.
// Logs in using credentials from CLI args, then navigates to a given authed route
// and screenshots it. The login is performed by driving the real UI (fill form, submit,
// wait for navigation) so that the Pinia auth store gets the token.
//
// Usage:
//   node authed-shot.mjs <email> <password> <route> [outPath] [--width N] [--height N] [--wait ms]
//
// Example:
//   node authed-shot.mjs mark@flyh2.com mypassword / ./planner.png
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
const positional = []
const opt = { width: 1440, height: 2000, wait: 0 }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--width') opt.width = Number(argv[++i])
  else if (a === '--height') opt.height = Number(argv[++i])
  else if (a === '--wait') opt.wait = Number(argv[++i])
  else positional.push(a)
}

const email = positional[0]
const password = positional[1]
const route = positional[2]
if (!email || !password || !route) {
  console.error('Usage: node authed-shot.mjs <email> <password> <route> [outPath] [--width N] [--height N] [--wait ms]')
  process.exit(2)
}

const outPath = resolve(positional[3] || 'authed-shot.png')
const consoleErrors = []
const consoleWarnings = []
const pageErrors = []

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: opt.width, height: opt.height } })
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
    else if (msg.type() === 'warning') consoleWarnings.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  // Navigate to login page and wait for full page load + hydration
  await page.goto('http://localhost:3200/login', { waitUntil: 'domcontentloaded', timeout: 30000 })

  // Extra wait for Vue to hydrate
  await page.waitForTimeout(500)

  // Fill login form and submit
  // Email input: input[type=email]
  // Password input: input[type=password]
  // Submit button: button[type=submit]

  // Wait for form elements to be visible
  await page.waitForSelector('input[type=email]', { timeout: 10000 })
  await page.waitForSelector('input[type=password]', { timeout: 10000 })
  await page.waitForSelector('button[type=submit]', { timeout: 10000 })

  // Fill the form using click + type for reliable input
  await page.click('input[type=email]')
  await page.type('input[type=email]', email, { delay: 50 })

  await page.click('input[type=password]')
  await page.type('input[type=password]', password, { delay: 50 })

  // Click submit and wait for navigation
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
  ])

  // Wait a bit for the app to fully load
  await page.waitForTimeout(1000)

  // Navigate to the target route (default is / for the planner)
  const targetUrl = `http://localhost:3200${route}`
  const resp = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 })
  if (opt.wait) await page.waitForTimeout(opt.wait)

  const title = await page.title()
  await page.screenshot({ path: outPath, fullPage: true })

  const summary = {
    url: page.url(),
    status: resp ? resp.status() : null,
    ok: resp ? resp.ok() : true,
    title,
    consoleErrors,
    consoleWarnings: consoleWarnings.length,
    pageErrors,
    screenshot: outPath,
    clean: consoleErrors.length === 0 && pageErrors.length === 0,
  }
  console.log(JSON.stringify(summary, null, 2))
} catch (err) {
  console.error('Error:', err.message)
  process.exit(1)
} finally {
  await browser.close()
}
