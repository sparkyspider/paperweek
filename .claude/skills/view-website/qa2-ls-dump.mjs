import { chromium } from 'playwright'
import * as rig from './dnd-rig.mjs'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', process.env.PW)
const ls = await page.evaluate(() => {
  const out = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    out[k] = localStorage.getItem(k)
  }
  return out
})
console.log(JSON.stringify(ls, null, 2))
await browser.close()
