import { chromium } from 'playwright'

const OUT = 'C:/Users/cambo/AppData/Local/Temp/claude/C--Users-cambo-dev-space-haven-calculator/23855316-2991-4448-b771-6a9b62c847e9/scratchpad'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5173/')
await page.evaluate(() => localStorage.removeItem('shc-welcome-v2'))
await page.reload()
await page.waitForSelector('.welcome-gate')
await page.waitForTimeout(1400)
await page.screenshot({ path: `${OUT}/fleet-final.png` })
console.log('ok')
await browser.close()
