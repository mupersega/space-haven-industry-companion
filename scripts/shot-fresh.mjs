import { chromium } from 'playwright'

const OUT = 'C:/Users/cambo/AppData/Local/Temp/claude/C--Users-cambo-dev-space-haven-calculator/23855316-2991-4448-b771-6a9b62c847e9/scratchpad'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5173/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForSelector('.welcome-gate')
await page.waitForTimeout(1800)
const glowCount = await page.locator('.wg-glow').count()
const boostCount = await page.locator('.wg-ship-boost').count()
console.log('fresh visitor — overlay glows:', glowCount, '| boost canvases:', boostCount)
await page.screenshot({ path: `${OUT}/fresh-default.png` })
console.log('ok')
await browser.close()
