// Régression Monza sur mobile : node tests/monza_startup.mjs [baseURL] [rapport.json]
// Le serveur doit servir les assets Monza assemblés ainsi que les assets communs du jeu.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from '@playwright/test'

const base = process.argv[2] || 'http://127.0.0.1:5398/'
const report = { base, logs: [], pageErrors: [], networkErrors: [], result: null }
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
})
const page = await context.newPage()
page.setDefaultTimeout(180000)
page.on('console', m => { if (m.text().startsWith('[w11]') || m.type() === 'error') report.logs.push({ type: m.type(), text: m.text() }) })
page.on('pageerror', e => report.pageErrors.push(String(e)))
page.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') report.networkErrors.push({ url: r.url(), error: r.failure()?.errorText }) })
page.on('response', r => { if (r.status() >= 400) report.networkErrors.push({ url: r.url(), status: r.status() }) })
const ready = () => page.waitForFunction(() => Boolean(window.__w11), null, { timeout: 240000 })
try {
  const initial = new URL(base); initial.searchParams.set('circuit', 'monza'); initial.searchParams.set('q', 'medium')
  await page.goto(initial.href, { waitUntil: 'domcontentloaded' })
  await ready()
  await page.evaluate(() => { const w = window.__w11; w.settings.profile.circuit = 'ita'; w.startQuick() })
  await ready()
  await page.waitForFunction(() => window.__w11?.screen === 'drive' && window.__w11?.fview?.ready, null, { timeout: 240000 })
  report.result = await page.evaluate(() => {
    const w = window.__w11, g = w.game, ren = w.ren, mercedes = w.fview.views.find(v => v.r.team === 'mercedes')
    const compressedAI = new Set()
    mercedes?.obj.traverse(o => {
      if (!o.isMesh) return
      for (const m of [o.material].flat()) for (const t of Object.values(m)) if (t?.isTexture && t.isCompressedTexture) compressedAI.add(t.source)
    })
    return { circuit: w.settings.profile.circuit, screen: w.screen, run: w.run?.kind, length: g.track.length,
      cars: g.field?.cars.length, views: w.fview.views.length, tiles: ren.tiles?.total, ktx: window.__w11diag.ktx,
      compressedMercedesAITextures: compressedAI.size, hudVisible: !document.getElementById('hud').hidden }
  })
  await page.evaluate(() => { window.__w11.fixedDt = 1 / 30 })
  const pedal = await page.locator('#pThrottle').boundingBox()
  await page.mouse.move(pedal.x + pedal.width / 2, pedal.y + 12); await page.mouse.down(); await page.waitForTimeout(2000); await page.mouse.up()
  report.result.player = await page.evaluate(() => ({ throttle: window.__w11.game.ctl.throttle,
    speedKmh: window.__w11.game.car.speed * 3.6, offTrack: window.__w11.game.car.offTrack }))
  assert.equal(report.result.circuit, 'ita')
  assert.equal(report.result.run, 'quick')
  assert.equal(report.result.screen, 'drive')
  assert.ok(Math.abs(report.result.length - 5786.2) < 2, 'Monza uses its own track surface')
  assert.equal(report.result.cars, 20)
  assert.equal(report.result.views, 19)
  assert.equal(report.result.tiles, 15)
  assert.equal(report.result.ktx, true)
  assert.equal(report.result.compressedMercedesAITextures, 0, 'Monza keeps the previous WebP Mercedes AI model')
  assert.equal(report.result.hudVisible, true)
  assert.ok(report.result.player.throttle > 0.9, 'player accelerator input is received')
  assert.ok(report.result.player.speedKmh > 0, 'player car moves')
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.networkErrors, [])
  console.log(JSON.stringify(report.result, null, 2))
  console.log('ALL MONZA STARTUP CHECKS PASS')
} catch (e) {
  report.failure = String(e)
  console.error(report.failure)
  console.error(JSON.stringify({ result: report.result, pageErrors: report.pageErrors, networkErrors: report.networkErrors, lastLogs: report.logs.slice(-12) }, null, 2))
  process.exitCode = 1
} finally {
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n')
  await browser.close()
}
