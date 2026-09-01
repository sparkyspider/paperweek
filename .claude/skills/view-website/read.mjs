#!/usr/bin/env node
// view-website: open one URL/local HTML in headless Chromium and extract its
// RENDERED content (after JS runs): the full DOM HTML and/or the visible page text.
// Writes files and prints a JSON summary; or streams one straight to stdout.
//
// Usage:
//   node read.mjs <url|path> [outBase]        -> writes <outBase>.html + <outBase>.txt
//   node read.mjs <url|path> --stdout html    -> print rendered HTML to stdout, nothing written
//   node read.mjs <url|path> --stdout text    -> print visible page text to stdout
//   node read.mjs <url|path> --html only       -> write only the .html
//   node read.mjs <url|path> --text only       -> write only the .txt
// Options: --wait <ms> extra settle time. outBase defaults to ./page (this folder).
import { chromium } from 'playwright'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const positional = []
const opt = { wait: 0, stdout: null, want: { html: true, text: true } }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--wait') opt.wait = Number(argv[++i])
  else if (a === '--stdout') opt.stdout = argv[++i] // 'html' | 'text'
  else if (a === '--html') { opt.want = { html: true, text: false }; if (argv[i + 1] === 'only') i++ }
  else if (a === '--text') { opt.want = { html: false, text: true }; if (argv[i + 1] === 'only') i++ }
  else positional.push(a)
}

let target = positional[0]
if (!target) {
  console.error('Usage: node read.mjs <url|path> [outBase] [--stdout html|text] [--html only] [--text only] [--wait ms]')
  process.exit(2)
}
const outBase = resolve(positional[1] || 'page')

if (!/^[a-z]+:\/\//i.test(target)) {
  const abs = resolve(target.replace(/^~(?=\/)/, process.env.HOME || '~'))
  if (!existsSync(abs)) { console.error(`No such file: ${abs}`); process.exit(2) }
  target = pathToFileURL(abs).href
}

const consoleErrors = []
const pageErrors = []

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  const resp = await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 })
  if (opt.wait) await page.waitForTimeout(opt.wait)

  const title = await page.title()
  const html = await page.content() // rendered DOM after JS
  const text = await page.evaluate(() => document.body?.innerText ?? '')

  // Stream one to stdout and exit — nothing written to disk.
  if (opt.stdout === 'html') { process.stdout.write(html); await browser.close(); process.exit(0) }
  if (opt.stdout === 'text') { process.stdout.write(text); await browser.close(); process.exit(0) }

  const written = {}
  if (opt.want.html) { const p = `${outBase}.html`; await writeFile(p, html); written.htmlPath = p }
  if (opt.want.text) { const p = `${outBase}.txt`; await writeFile(p, text); written.textPath = p }

  console.log(JSON.stringify({
    url: page.url(),
    status: resp ? resp.status() : null,
    title,
    htmlBytes: html.length,
    textChars: text.length,
    ...written,
    consoleErrors,
    pageErrors,
    clean: consoleErrors.length === 0 && pageErrors.length === 0,
  }, null, 2))
} finally {
  await browser.close()
}
