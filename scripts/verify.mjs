// End-to-end verification of the Space Haven Production Ledger.
// Run: node verify.mjs (from anywhere; uses the project's playwright install)
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
// progress screenshots land in the OS temp dir unless pointed elsewhere —
// writing them into the repo root kept resurrecting stray PNGs
const SHOT_DIR = process.env.SHOT_DIR ?? (await import('node:os')).tmpdir()
let failures = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
  if (!cond) failures++
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('shc-tour-v1', 'done') // keep the walkthrough down; tested explicitly later
  // fresh boards ship empty (the guided tour builds them) — seed the rifle
  // example the chain assertions expect
  localStorage.setItem('shc-state-v2', JSON.stringify({ orders: [{ itemId: 'rifle', qty: 1 }], buyList: ['fibers'] }))
})
await page.reload()

// --- 0. First-visit spoiler gate ---
await page.waitForSelector('.welcome-gate', { timeout: 10000 })
const gateBox = await page.locator('.welcome-gate').boundingBox()
ok('gate covers the whole screen', gateBox.width >= 1680 && gateBox.height >= 950, JSON.stringify(gateBox))
ok('gate warns about the wonder', /wonder/i.test(await page.locator('.welcome-gate').innerText()))
ok('official logo loads', await page.locator('.welcome-logo').evaluate((i) => i.naturalWidth > 0))
await page.waitForTimeout(600) // let the canvas backdrop paint
ok(
  'procedural backdrop painted (game-brush stars)',
  await page.locator('canvas[data-space-layer="far-stars"]').evaluate((cv) => {
    const g = cv.getContext('2d')
    const d = g.getImageData(0, 0, cv.width, cv.height).data
    let lit = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++
    return lit > 500
  }),
)
ok(
  'backlit planet painted',
  await page.locator('canvas[data-space-layer="planet"]').evaluate((cv) => {
    const g = cv.getContext('2d')
    const d = g.getImageData(0, 0, cv.width, cv.height).data
    let lit = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++
    return lit > 10000
  }),
)
ok('a fleet of ships', (await page.locator('.wg-ship').count()) >= 6)
// depth comes from the fleet's own surge, not mouse parallax
const driftAnim = await page
  .locator('.wg-ship-drift')
  .first()
  .evaluate((el) => getComputedStyle(el).animationName)
ok('fleet surges on the isometric heading', driftAnim === 'wg-drift', `animation=${driftAnim}`)
// board WITH the remember opt-in checked so the ack persists (click the
// label — the styled lamp span covers the real checkbox)
await page.locator('.welcome-remember').click()
await page.locator('.welcome-enter').click()
await page.waitForTimeout(800)
ok('gate dismissed after agreeing', (await page.locator('.welcome-gate').count()) === 0)
ok(
  'remember opt-in persisted',
  (await page.evaluate(() => localStorage.getItem('shc-welcome-v2'))) === 'ack',
)

await page.waitForSelector('.node-root', { timeout: 10000 })

// --- 1. Default rifle chain structure ---
const nodeNames = await page.$$eval('.node .node-name, .node-root .node-name', (els) =>
  els.map((e) => e.textContent.trim()),
)
for (const name of ['Rifle', 'Steel Plates', 'Plastics', 'Chemicals', 'Base Metals', 'Carbon', 'Raw Chemicals']) {
  ok(`node present: ${name}`, nodeNames.includes(name))
}
ok('no unexpected extra nodes', nodeNames.length === 7, `got ${nodeNames.length}: ${nodeNames.join(', ')}`)

// --- 2. Crafted cost math (defaults: bm 75, carbon 100, rawchem 100) ---
// steel = .2*75+.2*100 = 35 ; chem = 50 ; plastics = 100+.2*50 = 110 ; rifle = .7*35+110 = 134.5
const rootText = await page.locator('.node-root').innerText()
ok('rifle crafted cost 134.5', rootText.includes('134.5'), rootText.replace(/\n/g, ' | '))

// --- 3. Shopping list quantities ---
const tableText = await page.locator('.leaf-table').innerText()
ok('carbon qty 1.14 in shopping list', /Carbon\s+1\.14/.test(tableText))
ok('base metals qty 0.14', /Base Metals\s+0\.14/.test(tableText))
ok('raw chemicals qty 0.1', /Raw Chemicals\s+0\.1\b/.test(tableText))
await page.screenshot({ path: `${SHOT_DIR}/1-initial.png` })

// --- 4. Target sale price via trade-value button ---
await page.locator('.sidebar .use-default').first().click()
const orderPanel = await page.locator('.sidebar').innerText()
ok('verdict worth crafting', orderPanel.includes('Worth crafting'))
ok('margin 465.5', orderPanel.includes('465.5'))
ok('max buy column appears', /max buy/i.test(orderPanel))
// ceiling for carbon = 100 + (600-134.5)/1.14 = 508.3
ok('carbon ceiling ~508.3', /508\.3/.test(await page.locator('.leaf-table').innerText()))
await page.screenshot({ path: `${SHOT_DIR}/2-target.png` })

// --- 5. Live price edit: carbon 100 -> 200 => cost 134.5 + 114 = 248.5 ---
const carbonInput = page.locator('.node', { hasText: 'Carbon' }).locator('input.price-input')
await carbonInput.fill('200')
await page.waitForTimeout(300)
ok('cost updates to 248.5 after carbon=200', (await page.locator('.node-root').innerText()).includes('248.5'))

// --- 6. Buy toggle on Plastics collapses subtree, prefills crafted cost ---
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('shc-welcome-v2', 'ack') // keep the spoiler gate down
  localStorage.setItem('shc-tour-v1', 'done') // and the walkthrough
  localStorage.setItem('shc-state-v2', JSON.stringify({ orders: [{ itemId: 'rifle', qty: 1 }], buyList: ['fibers'] }))
})
await page.reload()
await page.waitForSelector('.node-root')
await page.locator('.node', { hasText: 'Plastics' }).locator('.toggle-buy').click()
await page.waitForTimeout(400)
const namesAfter = await page.$$eval('.node .node-name, .node-root .node-name', (els) =>
  els.map((e) => e.textContent.trim()),
)
ok('chemicals hidden after buying plastics', !namesAfter.includes('Chemicals'))
const plasticsPrice = await page
  .locator('.node', { hasText: 'Plastics' })
  .locator('input.price-input')
  .inputValue()
ok('plastics buy price prefilled with crafted cost 110', plasticsPrice === '110')

// --- 7. Add second order via palette click; shared nodes merge ---
await page.locator('.palette-item', { hasText: 'Laser Rifle' }).click()
await page.waitForTimeout(400)
const roots = await page.locator('.node-root').count()
ok('two manifest cards after adding Laser Rifle', roots === 2)
const merged = await page.$$eval('.node .node-name, .node-root .node-name', (els) =>
  els.map((e) => e.textContent.trim()),
)
ok('base metals node merged (appears once)', merged.filter((n) => n === 'Base Metals').length === 1)
await page.screenshot({ path: `${SHOT_DIR}/3-multi-order.png`, fullPage: false })

// --- 8. Icons render (at least some) ---
const iconCount = await page.$$eval('img.item-icon', (imgs) => imgs.filter((i) => i.naturalWidth > 0).length)
console.log(`INFO  rendered item icons: ${iconCount}`)

// --- 9. Catalogue badge counts; left click adds one, right click removes one ---
const laserRow = page
  .locator('.palette-item')
  .filter({ has: page.locator('.palette-name', { hasText: /^Laser Rifle$/ }) })
ok('laser rifle badge shows ×1', (await laserRow.locator('.qty-badge').innerText()) === '×1')
await laserRow.click()
await page.waitForTimeout(200)
ok('left click raises badge to ×2', (await laserRow.locator('.qty-badge').innerText()) === '×2')
await laserRow.click({ button: 'right' })
await page.waitForTimeout(200)
ok('right click lowers badge to ×1', (await laserRow.locator('.qty-badge').innerText()) === '×1')
await laserRow.click({ button: 'right' })
await page.waitForTimeout(600)
ok('right click at ×1 removes the order', (await page.locator('.node-root').count()) === 1)

// --- 10. Hovering a catalogue item highlights its node on the board ---
const rifleRow = page
  .locator('.palette-item')
  .filter({ has: page.locator('.palette-name', { hasText: /^Rifle$/ }) })
ok('rifle row marked on-board', await rifleRow.evaluate((el) => el.classList.contains('on-board')))
await rifleRow.hover()
await page.waitForTimeout(150)
const rifleBorder = await page
  .locator('.react-flow__node[data-id="rifle"] .node')
  .evaluate((el) => getComputedStyle(el).borderTopColor)
ok('rifle node highlighted teal on hover', rifleBorder === 'rgb(69, 213, 194)', rifleBorder)

// --- 11. Mouse wheel steps number inputs by 1 ---
const carbonInput2 = page.locator('.node', { hasText: 'Carbon' }).locator('input.price-input')
const before = await carbonInput2.inputValue()
await carbonInput2.dispatchEvent('wheel', { deltaY: -100 })
await page.waitForTimeout(200)
const after = await carbonInput2.inputValue()
ok('wheel up increments price by 1', Number(after) === Number(before) + 1, `${before} -> ${after}`)
await carbonInput2.dispatchEvent('wheel', { deltaY: 100 })
await page.waitForTimeout(200)
ok('wheel down decrements back', Number(await carbonInput2.inputValue()) === Number(before))
await carbonInput2.dispatchEvent('wheel', { deltaY: -100, ctrlKey: true })
await page.waitForTimeout(200)
ok('ctrl+wheel steps by 10', Number(await carbonInput2.inputValue()) === Number(before) + 10)
await carbonInput2.dispatchEvent('wheel', { deltaY: 100, shiftKey: true })
await page.waitForTimeout(200)
ok('shift+wheel steps by 5', Number(await carbonInput2.inputValue()) === Number(before) + 5)

// --- 11b. Base trade value shown on cards; click resets a bought price ---
const carbonNode = page.locator('.node', { hasText: 'Carbon' })
ok('carbon card shows base value', /base value/i.test(await carbonNode.innerText()))
await carbonNode.locator('.use-default').click()
await page.waitForTimeout(200)
ok('base-value click resets price to 100', (await carbonInput2.inputValue()) === '100')
const steelNode = page.locator('.node', { hasText: 'Steel Plates' })
ok('crafted card shows base value 150', /base value\s*150/i.test((await steelNode.innerText()).replace(/\n/g, ' ')))
ok('root card shows base trade value 600', /base trade value 600/i.test(await page.locator('.node-root').first().innerText()))

// --- 12. Trade-only goods: connectionless purple roots ---
const cspRow = page
  .locator('.palette-item')
  .filter({ has: page.locator('.palette-name', { hasText: /^CSP$/ }) })
const edgesBefore = await page.locator('.react-flow__edge').count()
await cspRow.click()
await page.mouse.move(700, 120) // off the palette so the hover highlight clears
await page.waitForTimeout(600)
const tradeRoot = page.locator('.node-root-market')
ok('CSP appears as market root card', (await tradeRoot.count()) === 1)
const tradeBorder = await tradeRoot.evaluate((el) => getComputedStyle(el).borderTopColor)
ok('trade root is purple', tradeBorder === 'rgb(167, 139, 250)', tradeBorder)
ok('trade root shows buy cost 1,100', /1,100/.test(await tradeRoot.innerText()))
ok('CSP adds no edges (connectionless)', (await page.locator('.react-flow__edge').count()) === edgesBefore)
ok('trade good not in shopping list', !/CSP/.test(await page.locator('.leaf-table').innerText()))
await cspRow.click({ button: 'right' })
await page.waitForTimeout(400)
ok('right click removes trade good', (await page.locator('.node-root-market').count()) === 0)

// raw resources can be pinned too, colored by category
const nobleRow = page
  .locator('.palette-item')
  .filter({ has: page.locator('.palette-name', { hasText: /^Noble Metals$/ }) })
await nobleRow.click()
await page.mouse.move(700, 120)
await page.waitForTimeout(600)
const rawRoot = page.locator('.node-root-market')
ok('Noble Metals pins as market card', (await rawRoot.count()) === 1)
const rawBorder = await rawRoot.evaluate((el) => getComputedStyle(el).borderTopColor)
ok('raw card uses asteroid-raw color', rawBorder === 'rgb(217, 160, 91)', rawBorder)
await nobleRow.click({ button: 'right' })
await page.waitForTimeout(400)
ok('right click removes raw card', (await page.locator('.node-root-market').count()) === 0)

// --- 13. Salvage chain: scrap pins with rightward yield edges ---
const scrapRow = page
  .locator('.palette-item')
  .filter({ has: page.locator('.palette-name', { hasText: /^Tech Scrap$/ }) })
await scrapRow.click()
await page.mouse.move(700, 120)
await page.waitForTimeout(700)
const scrapRoot = page.locator('.node-root-market')
ok('tech scrap pins as salvage card', (await scrapRoot.count()) === 1)
const scrapText = await scrapRoot.innerText()
// yields at market: 0.1×190 + 0.06×500 + 0.11×320 = 84.2 vs 50 buy → recycle
ok('scrap card shows yield 84.2 cr/unit', /84\.2/.test(scrapText), scrapText.replace(/\n/g, ' | '))
ok('scrap card says recycle (+34.2)', /recycle, \+34\.2/.test(scrapText))
const salvageEdgeCount = await page.locator('.react-flow__edge.salvage-edge').count()
ok('three dashed salvage edges', salvageEdgeCount === 3, String(salvageEdgeCount))
const techblockNode = page.locator('.node', { hasText: 'Techblock' })
ok('techblock yield node valued at market 320', /320/.test(await techblockNode.innerText()))
ok('techblock shows salvage yield +0.11', /\+0\.11/.test(await techblockNode.innerText()))
ok('yield outputs not in shopping list', !/Techblock/.test(await page.locator('.leaf-table').innerText()))
await scrapRow.click({ button: 'right' })
await page.waitForTimeout(400)

// --- 14. ROI (value for money) on products ---
// pistol: cost 0.3×35+110 = 120.5, sells 300 → +149% ; smg: 127.5 → +214%
const pistolRow = page
  .locator('.palette-item')
  .filter({ has: page.locator('.palette-name', { hasText: /^Pistol$/ }) })
ok('pistol row keeps sell value 300', (await pistolRow.locator('.palette-price').innerText()) === '300')
ok('pistol row shows +149% roi', (await pistolRow.locator('.palette-roi').innerText()) === '+149%')
const smgRow = page
  .locator('.palette-item')
  .filter({ has: page.locator('.palette-name', { hasText: /^SMG$/ }) })
ok('smg row shows +214% roi', (await smgRow.locator('.palette-roi').innerText()) === '+214%')
ok('rifle card shows +346% on cost', /\+346% on cost/.test(await page.locator('.node-root').first().innerText()))

// --- 15. Material worth view ---
await page.locator('.node', { hasText: 'Base Metals' }).locator('.node-worth').click()
await page.waitForTimeout(300)
ok('worth modal opens', (await page.locator('.worth-modal').count()) === 1)
const worthText = await page.locator('.worth-modal').innerText()
// rifle imputes 75 + (600 − 134.5) / 0.14 = 3,400 per unit of base metals
ok('rifle imputed 3,400 listed', /3,400/.test(worthText))
ok('best-use tag on top row', (await page.locator('.worth-table tr.best .best-tag').count()) === 1)
const imputedVals = await page.$$eval('.worth-table tbody tr td:nth-child(4)', (tds) =>
  tds.map((td) => Number(td.textContent.replace(/,/g, ''))),
)
ok('rows ranked descending', imputedVals.every((v, i) => i === 0 || v <= imputedVals[i - 1]))
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
ok('escape closes worth modal', (await page.locator('.worth-modal').count()) === 0)

// --- 16. Chain-less items carry usage notes ---
const bioRow = page
  .locator('.palette-item')
  .filter({ has: page.locator('.palette-name', { hasText: /^Bio Matter$/ }) })
await bioRow.click()
await page.mouse.move(700, 120)
await page.waitForTimeout(600)
const bioCard = page.locator('.node-root-market')
ok('bio matter pins with usage notes', /Composter turns 1 into/.test(await bioCard.innerText()))
await bioCard.locator('.node-worth').click()
await page.waitForTimeout(300)
ok('worth modal shows notes for chain-less item', /Algae Dispensers/.test(await page.locator('.worth-modal').innerText()))
await page.keyboard.press('Escape')
await bioRow.click({ button: 'right' })
await page.waitForTimeout(300)

// --- 17. Brisbane 8888 clock ---
const clockTime = await page.locator('.seg-row').getAttribute('data-time')
const expected = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Brisbane',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date())
ok('clock shows Brisbane time', clockTime === expected, `clock ${clockTime} vs expected ${expected}`)
ok('clock has lit segments', (await page.locator('.seg.on').count()) > 0)

// --- 18. Alarm ---
await page.locator('.alarm-chip').click()
ok('alarm popover opens', (await page.locator('.alarm-pop').count()) === 1)
ok('three jingle options', (await page.locator('.jingle-opt').count()) === 3)
await page.locator('.jingle-opt', { hasText: 'Klaxon Bounce' }).click()
ok('jingle selection persists', (await page.evaluate(() => localStorage.getItem('shc-jingle-v1'))) === 'klaxon')
await page.locator('.alarm-presets button', { hasText: '+5m' }).click()
await page.waitForTimeout(200)
const chipTitle = (await page.locator('.alarm-chip').getAttribute('data-tip')) ?? ''
const in5 = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Brisbane',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date(Date.now() + 5 * 60_000))
ok('alarm bell shows +5m Brisbane time', chipTitle.includes(in5), `title ${chipTitle} vs ${in5}`)
ok('alarm bell lit when set', (await page.locator('.alarm-chip.set').count()) === 1)
await page.locator('.alarm-chip').click() // cancel
await page.waitForTimeout(200)
ok('alarm cancels on bell click', (await page.locator('.alarm-chip.set').count()) === 0)
// wind-up wobble ramps in the last 5s, then the alarm fires
await page.evaluate(() => localStorage.setItem('shc-alarm-v1', String(Date.now() + 6500)))
await page.reload()
await page.waitForSelector('.seg-row')
await page.waitForTimeout(3200)
ok('clock wobbles during wind-up', (await page.locator('.seg-row.wobble').count()) === 1)
await page.waitForSelector('.alarm-overlay', { timeout: 8000 })
ok('alarm overlay fires', true)
await page.locator('.alarm-box .reset-btn').click()
await page.waitForTimeout(300)
ok('dismiss clears overlay', (await page.locator('.alarm-overlay').count()) === 0)

// --- 19. Zero layout shift when catalogue items are (de)selected ---
const measureRows = () =>
  page.$$eval('.palette-item', (els) => els.map((el) => [el.getBoundingClientRect().top, el.getBoundingClientRect().height]))
const shotgunRow = page
  .locator('.palette-item')
  .filter({ has: page.locator('.palette-name', { hasText: /^Shotgun$/ }) })
const before19 = await measureRows()
await shotgunRow.click()
await page.waitForTimeout(250)
const after19 = await measureRows()
ok(
  'no catalogue layout shift on select',
  before19.length === after19.length && before19.every((r, i) => r[0] === after19[i][0] && r[1] === after19[i][1]),
  JSON.stringify(before19.find((r, i) => r[0] !== after19[i]?.[0] || r[1] !== after19[i]?.[1]) ?? 'ok'),
)
await shotgunRow.click({ button: 'right' })
await page.waitForTimeout(250)

// --- 20. Facility mode ---
// fresh rifle board (defaults ship empty now, so seed it)
await page.evaluate(() =>
  localStorage.setItem('shc-state-v2', JSON.stringify({ orders: [{ itemId: 'rifle', qty: 1 }], buyList: ['fibers'] })),
)
await page.reload()
await page.waitForSelector('.node-root')
ok('facility panel starts off', (await page.locator('.facility-panel.off').count()) === 1)
const factoryOff = await page.locator('.fac-factory').evaluate((el) => getComputedStyle(el).color)
ok('factory icon red when off', factoryOff === 'rgb(255, 107, 122)', factoryOff)
await page.locator('.fac-factory').click()
await page.waitForTimeout(450)
const factoryOn = await page.locator('.fac-factory').evaluate((el) => getComputedStyle(el).color)
ok('factory icon green when on', factoryOn === 'rgb(126, 212, 145)', factoryOn)
// rifle flow: Item Fabricator (rifle), Metal Refinery (steel), Chemical Refinery (plastics + chemicals)
ok('three facility tiles for rifle flow', (await page.locator('.fac-tilebtn').count()) === 3)
ok('all tiles red (needed) initially', (await page.locator('.fac-tilebtn.need').count()) === 3)
ok('tile names on hover tip', /Metal Refinery — not built/.test((await page.locator('.fac-tilebtn[data-tip*="Metal Refinery"]').getAttribute('data-tip')) ?? ''))
// tippy renders the data-tip as a themed tooltip
await page.locator('.fac-help').hover()
await page.waitForTimeout(600)
ok(
  'tippy tooltip appears on hover',
  /walkthrough/i.test((await page.locator('.tippy-box').textContent().catch(() => '')) ?? ''),
)
await page.mouse.move(400, 400)
await page.waitForTimeout(300)
ok('steel card flags missing facility', /Metal Refinery · Ind 1 — not built/.test(await page.locator('.node', { hasText: 'Steel Plates' }).innerText()))
// hammer = edit mode: waves the flow set out, then all facilities in
await page.locator('.fac-hammer').click()
await page.waitForTimeout(1200)
ok('edit mode lists all 11 facilities', (await page.locator('.fac-tilebtn').count()) === 11)
ok('edit mode shows outlined labels', (await page.locator('.fac-label').count()) === 11)
ok('3 flow facilities tagged in chain', (await page.locator('.fac-tilebtn.relevant').count()) === 3)
ok('8 others dimmed', (await page.locator('.fac-tilebtn.irrelevant').count()) === 8)
ok('in-chain tag text present', /in chain/i.test(await page.locator('.fac-tag').first().innerText()))
await page.locator('.fac-tilebtn', { hasText: 'Metal Refinery' }).click()
await page.waitForTimeout(200)
await page.locator('.fac-hammer').click() // done
await page.waitForTimeout(1400)
ok('back to flow tiles, metal refinery built', (await page.locator('.fac-tilebtn.need').count()) === 2)
ok('steel card flag clears once built', !/not built/.test(await page.locator('.node', { hasText: 'Steel Plates' }).innerText()))
await page.locator('.fac-factory').click()
await page.waitForTimeout(250)
ok('facility mode toggles back off', (await page.locator('.facility-panel.off').count()) === 1)
ok('hammer disabled when mode off', await page.locator('.fac-hammer').isDisabled())
ok('built facilities persist in storage', /metal-refinery/.test((await page.evaluate(() => localStorage.getItem('shc-state-v2'))) ?? ''))

// --- 21. Exodus fleet banner ---
ok(
  'fleet backdrop image loads',
  await page.locator('.brand-bg').evaluate((img) => img.naturalWidth > 0),
)

// --- 22. driver.js guided first-run walkthrough ---
// true first visit: no tour flag AND no board state → guided mode
await page.evaluate(() => {
  localStorage.removeItem('shc-tour-v1')
  localStorage.removeItem('shc-state-v2')
})
await page.reload()
await page.waitForSelector('.driver-popover', { timeout: 5000 })
ok(
  'guided walkthrough auto-starts on an empty board',
  /catalogue/i.test((await page.locator('.driver-popover-title').textContent()) ?? ''),
)
ok(
  'guided step 1 has no next button — the click is the way forward',
  !(await page.locator('.driver-popover-next-btn').isVisible().catch(() => false)),
)
ok('board starts empty', (await page.locator('.node-root').count()) === 0)
// the walkthrough locks you in: stray clicks and escape don't eject you
await page.mouse.click(800, 500)
await page.waitForTimeout(350)
ok('overlay click does not exit the walkthrough', (await page.locator('.driver-popover').count()) === 1)
await page.keyboard.press('Escape')
await page.waitForTimeout(350)
ok('escape does not exit the walkthrough', (await page.locator('.driver-popover').count()) === 1)
await page.locator('[data-item="rifle"]').click()
await page.waitForTimeout(1300)
ok(
  'clicking rifle assembles the chain and advances the tour',
  (await page.locator('.node-root').count()) === 1 &&
    /final product/i.test((await page.locator('.driver-popover-title').textContent()) ?? ''),
  `title=${await page.locator('.driver-popover-title').textContent()}`,
)
let tourSteps = 2
for (let i = 0; i < 10; i++) {
  const next = page.locator('.driver-popover-next-btn')
  if ((await next.count()) === 0) break
  await next.click()
  await page.waitForTimeout(350)
  if ((await page.locator('.driver-popover').count()) === 0) break
  tourSteps++
}
ok('walkthrough covers 7 stops and closes', tourSteps === 7 && (await page.locator('.driver-popover').count()) === 0, `steps=${tourSteps}`)
ok(
  'walkthrough marked seen',
  (await page.evaluate(() => localStorage.getItem('shc-tour-v1'))) === 'done',
)
// replay on a populated board: classic tour with next buttons
await page.locator('.fac-help').click()
await page.waitForSelector('.driver-popover', { timeout: 3000 })
ok('help button replays the walkthrough off-rails', await page.locator('.driver-popover-next-btn').isVisible())
await page.locator('.driver-popover-close-btn').click()
await page.waitForTimeout(300)
ok('the ✕ dismisses the walkthrough', (await page.locator('.driver-popover').count()) === 0)

// --- 23. Console errors ---
ok('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' ;; '))

await browser.close()
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
