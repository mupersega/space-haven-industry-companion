import { chromium } from 'playwright'

// Renderer CPU sampled over 6 idle seconds sitting on the welcome gate.
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5173/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForSelector('.welcome-gate')
await page.waitForTimeout(2500) // let the scene finish painting

const client = await page.context().newCDPSession(page)
await client.send('Performance.enable')
const grab = async () => {
  const { metrics } = await client.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
}
const a = await grab()
await page.waitForTimeout(6000)
const b = await grab()
const ms = (k) => ((b[k] - a[k]) * 1000).toFixed(0)
console.log(`over 6s idle on the gate:`)
console.log(`  renderer task time : ${ms('TaskDuration')} ms`)
console.log(`  script             : ${ms('ScriptDuration')} ms`)
console.log(`  style recalc       : ${ms('RecalcStyleDuration')} ms`)
console.log(`  layout             : ${ms('LayoutDuration')} ms`)
await browser.close()
