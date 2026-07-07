import { chromium } from 'playwright'

// idle CPU on the calculator view (default rifle chain, animated edges)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5173/')
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('shc-welcome-v1', 'ack')
})
await page.reload()
await page.waitForSelector('.react-flow')
await page.waitForTimeout(2500)
const client = await page.context().newCDPSession(page)
await client.send('Performance.enable')
const grab = async () => {
  const { metrics } = await client.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
}
const a = await grab()
await page.waitForTimeout(6000)
const b = await grab()
console.log('calculator idle 6s — renderer task:', ((b.TaskDuration - a.TaskDuration) * 1000).toFixed(0), 'ms')
await browser.close()
