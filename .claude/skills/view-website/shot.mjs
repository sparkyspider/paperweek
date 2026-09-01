#!/usr/bin/env node
// view-website: open one URL/local HTML in headless Chromium, screenshot it, and
// print a JSON summary (final URL, HTTP status, console + page errors, title, path).
// Usage: node shot.mjs <url|path> [outPath] [--width N] [--height N] [--no-full] [--wait ms]
import { chromium } from 'playwright'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const positional = []
const opt = { width: 1440, height: 2000, full: true, wait: 0 }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--width') opt.width = Number(argv[++i])
  else if (a === '--height') opt.height = Number(argv[++i])
  else if (a === '--wait') opt.wait = Number(argv[++i])
  else if (a === '--no-full') opt.full = false
  else if (a === '--full') opt.full = true
  else positional.push(a)
}

let target = positional[0]
if (!target) {
  console.error('Usage: node shot.mjs <url|path> [outPath] [--width N] [--height N] [--no-full] [--wait ms]')
  process.exit(2)
}
const outPath = resolve(positional[1] || 'shot.png')

// Turn a bare local path into a file:// URL; leave real URLs alone.
if (!/^[a-z]+:\/\//i.test(target)) {
  const abs = resolve(target.replace(/^~(?=\/)/, process.env.HOME || '~'))
  if (!existsSync(abs)) {
    console.error(`No such file: ${abs}`)
    process.exit(2)
  }
  target = pathToFileURL(abs).href
}

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

  const resp = await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 })
  if (opt.wait) await page.waitForTimeout(opt.wait)

  const title = await page.title()
  await page.screenshot({ path: outPath, fullPage: opt.full })

  const summary = {
    url: page.url(),
    status: resp ? resp.status() : null, // null for file:// (no HTTP)
    ok: resp ? resp.ok() : true,
    title,
    consoleErrors,
    consoleWarnings: consoleWarnings.length, // count only; errors listed in full
    pageErrors,
    screenshot: outPath,
    clean: consoleErrors.length === 0 && pageErrors.length === 0,
  }
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await browser.close()
}
