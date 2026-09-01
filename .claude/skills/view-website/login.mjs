#!/usr/bin/env node
// view-website: simplified password-only login for Paperweek.
// Launches Chromium, opens the login page, uses fetch-in-page to POST credentials,
// and returns the access token.
//
// Usage (CLI mode):
//   node login.mjs <email> <password>
//
// Exported function:
//   login(context, email, password) -> { accessToken }
import { chromium } from 'playwright'

export async function login(browser, email, password) {
  // browser is a Browser object from chromium.launch()
  const page = await browser.newPage()
  try {
    // Navigate to the login page (ungated)
    await page.goto('http://localhost:3200/login', { waitUntil: 'networkidle', timeout: 30000 })

    // Use fetch-in-page to POST credentials to the auth BFF endpoint
    // The response envelope has token at data.accessToken
    // Wrap arguments in an object to avoid "too many arguments" error
    const result = await page.evaluate(async (args) => {
      const response = await fetch('http://localhost:3201/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: args.email, password: args.password }),
      })
      const envelope = await response.json()
      return {
        ok: response.ok,
        status: response.status,
        accessToken: envelope.data?.accessToken,
        error: envelope.error,
      }
    }, { email, password })

    if (!result.ok) {
      throw new Error(`Login failed: ${result.error || `HTTP ${result.status}`}`)
    }

    return { accessToken: result.accessToken }
  } finally {
    await page.close()
  }
}

// CLI mode: node login.mjs <email> <password>
if (process.argv[1].endsWith('login.mjs')) {
  const email = process.argv[2]
  const password = process.argv[3]
  if (!email || !password) {
    console.error('Usage: node login.mjs <email> <password>')
    process.exit(2)
  }

  const browser = await chromium.launch({ headless: true })
  try {
    const result = await login(browser, email, password)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  } finally {
    await browser.close()
  }
}
