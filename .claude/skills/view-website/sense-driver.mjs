#!/usr/bin/env node
// Sense-tester scratch driver (temporary, mirrors other test-*.mjs files in this folder).
// Persists a storageState between runs so we stay logged in across invocations.
import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const STATE_PATH = resolve(process.env.PW_STATE || './pw-state.json')
const BASE = 'http://localhost:3200'

const [, , cmd, ...args] = process.argv

async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true })
  const contextOpts = { viewport: { width: 1600, height: 1100 } }
  if (existsSync(STATE_PATH)) contextOpts.storageState = STATE_PATH
  const context = await browser.newContext(contextOpts)
  const page = await context.newPage()
  const consoleErrors = []
  const apiCalls = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message))
  page.on('request', (req) => {
    if (req.method() !== 'GET') apiCalls.push({ phase: 'started', method: req.method(), url: req.url(), body: req.postData(), auth: req.headers()['authorization'] ? 'present' : 'absent' })
    if (req.url().includes('/api/tasks') && req.method() === 'PATCH') global.__lastAuthHeader = req.headers()['authorization']
  })
  page.on('requestfinished', async (req) => {
    try {
      const url = req.url()
      if (url.includes(':3201/') || req.method() !== 'GET') {
        const resp = await req.response()
        apiCalls.push({ phase: 'finished', method: req.method(), url, status: resp ? resp.status() : null })
      }
    } catch {}
  })
  page.on('requestfailed', (req) => {
    apiCalls.push({ phase: 'failed', method: req.method(), url: req.url(), failed: req.failure()?.errorText })
  })
  try {
    await fn(page, context)
  } finally {
    await context.storageState({ path: STATE_PATH })
    if (consoleErrors.length) console.error('CONSOLE_ERRORS:', JSON.stringify(consoleErrors))
    if (apiCalls.length) console.error('API_CALLS:', JSON.stringify(apiCalls))
    await browser.close()
  }
}

async function main() {
  if (cmd === 'login') {
    const email = args[0] || process.env.PW_EMAIL
    const password = process.env.PW_PASSWORD
    await withBrowser(async (page) => {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(500)
      await page.waitForSelector('input[type=email]', { timeout: 10000 })
      await page.click('input[type=email]')
      await page.type('input[type=email]', email, { delay: 30 })
      await page.click('input[type=password]')
      await page.type('input[type=password]', password, { delay: 30 })
      await Promise.all([
        page.click('button[type=submit]'),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      ])
      await page.waitForTimeout(1000)
      console.log('logged in, url=', page.url())
    })
    return
  }

  if (cmd === 'goto') {
    await withBrowser(async (page) => {
      await page.goto(`${BASE}${args[0]}`, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(300)
      console.log('at', page.url())
    })
    return
  }

  const path = process.env.PW_PATH || '/'

  if (cmd === 'shot') {
    const out = resolve(args[0] || 'shot.png')
    const full = args.includes('--full')
    await withBrowser(async (page) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: out, fullPage: full })
      console.log('shot ->', out)
    })
    return
  }

  if (cmd === 'run') {
    const scriptPath = args[0]
    const steps = JSON.parse(readFileSync(scriptPath, 'utf8'))
    await withBrowser(async (page) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(400)
      let i = 0
      for (const step of steps) {
        i++
        try {
          if (step.action === 'click') await page.click(step.selector, { timeout: 5000 })
          else if (step.action === 'clickText') {
            const loc = step.exact ? page.getByText(step.text, { exact: true }) : page.getByText(step.text)
            await loc.first().click({ timeout: 5000 })
          }
          else if (step.action === 'type') await page.type(step.selector, step.text, { delay: 20 })
          else if (step.action === 'fill') await page.fill(step.selector, step.text)
          else if (step.action === 'press') await page.press(step.selector, step.key)
          else if (step.action === 'keypress') await page.keyboard.press(step.key)
          else if (step.action === 'wait') await page.waitForTimeout(step.ms)
          else if (step.action === 'shot') {
            const opts = { path: resolve(step.path), fullPage: !!step.full }
            if (step.clip) opts.clip = step.clip
            if (step.scale) opts.scale = step.scale
            await page.screenshot(opts)
          }
          else if (step.action === 'hover') await page.hover(step.selector, { timeout: 5000 })
          else if (step.action === 'dblclick') await page.dblclick(step.selector, { timeout: 5000 })
          else if (step.action === 'dragTo') await page.dragAndDrop(step.source, step.target, { timeout: 8000 })
          else if (step.action === 'evalClick') {
            const ok = await page.evaluate(new Function(step.code))
            console.log('evalClick', i, 'result=', ok)
          }
          else if (step.action === 'eval') {
            const r = await page.evaluate(new Function(step.code))
            console.log('EVAL', i, JSON.stringify(r))
          }
          else if (step.action === 'keyboardType') await page.keyboard.type(step.text, { delay: 20 })
          else if (step.action === 'mouseMove') await page.mouse.move(step.x, step.y, { steps: step.steps || 5 })
          else if (step.action === 'mouseDown') await page.mouse.down()
          else if (step.action === 'mouseUp') await page.mouse.up()
          else if (step.action === 'rectOf') {
            const r = await page.evaluate(new Function(step.code))
            console.log('RECT', i, JSON.stringify(r))
          }
          else console.error('unknown action', step.action)
        } catch (e) {
          console.error(`STEP ${i} (${step.action}) FAILED:`, e.message)
        }
      }
      console.log('done, final url', page.url())
    })
    return
  }

  if (cmd === 'text') {
    await withBrowser(async (page) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(400)
      const t = await page.evaluate(() => document.body.innerText)
      console.log(t)
    })
    return
  }

  if (cmd === 'html') {
    await withBrowser(async (page) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(400)
      const sel = args[0]
      const h = sel ? await page.locator(sel).first().evaluate(el => el.outerHTML) : await page.content()
      console.log(h)
    })
    return
  }

  console.error('Unknown command', cmd)
  process.exit(2)
}

main().catch((e) => { console.error(e); process.exit(1) })
