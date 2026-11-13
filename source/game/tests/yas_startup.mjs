// Régression du lancement Yas sur mobile : node tests/yas_startup.mjs [baseURL] [rapport.json]
// Le serveur doit servir les assets communs assemblés et les assets Yas de source/game/public.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium, webkit } from '@playwright/test'

const base = process.argv[2] || 'http://127.0.0.1:5299/'
const engine = process.env.YAS_STARTUP_ENGINE || 'chromium'
const report = { base, engine, logs: [], pageErrors: [], crashes: 0, result: null }
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
}))
const context = await browser.newContext({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
})
const page = await context.newPage()
page.setDefaultTimeout(180000) // SwiftShader peut bloquer le premier rendu de la vitrine, contrairement à un GPU matériel.
page.on('console', m => { if (m.text().startsWith('[w11]') || m.type() === 'error') report.logs.push({ type: m.type(), text: m.text() }) })
page.on('pageerror', e => report.pageErrors.push(String(e)))
page.on('crash', () => { report.crashes++; console.error('PAGE_CRASH') })
const ready = () => page.waitForFunction(() => Boolean(window.__w11), null, { timeout: 300000 })
const next = () => page.locator('.ap-foot').getByRole('button', { name: 'Continuer', exact: true }).click()
try {
  const direct = process.env.YAS_STARTUP_DIRECT === '1'
  const initial = new URL(base); initial.searchParams.set('circuit', direct ? 'yas' : 'spa')
  await page.goto(initial.href, { waitUntil: 'domcontentloaded' })
  await ready()
  if (direct) {
    await page.evaluate(() => { const w = window.__w11; w.settings.profile.circuit = 'abu'; w.startQuick() })
    console.log('OK démarrage direct de la course rapide Yas')
  } else {
    console.log('OK chargement initial Spa')
    await page.locator('#bootGo').click()
    await page.locator('button.ap-tile').filter({ hasText: 'Course rapide' }).click()
    await page.locator('button.ap-drv').filter({ hasText: 'Hamilton' }).click()
    await next()
    await page.locator('.ap-page:not(.out-l) button.ap-row').filter({ hasText: 'Yas Marina' }).click()
    await next()
    await next()
    await Promise.all([
      page.waitForURL(url => url.searchParams.get('circuit') === 'yas', { timeout: 30000 }),
      page.locator('.ap-foot').getByRole('button', { name: 'Démarrer la course', exact: true }).click(),
    ])
    console.log('OK sélection Yas : rechargement avec reprise de course')
  }
  await ready()
  await page.waitForFunction(() => window.__w11?.screen === 'drive' && window.__w11?.fview?.ready, null, { timeout: 300000 })
  report.result = await page.evaluate(() => {
    const w = window.__w11, g = w.game, ren = w.ren, sources = new Set(), compressed = new Set()
    ren.rig.root.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) for (const t of Object.values(m)) {
      if (!t?.isTexture) continue; sources.add(t.source); if (t.isCompressedTexture) compressed.add(t.source)
    } })
    const aiCompressed = new Set(), mercedesAI = w.fview.views.find(v => v.r.team === 'mercedes')
    mercedesAI?.obj.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) for (const t of Object.values(m)) {
      if (t?.isTexture && t.isCompressedTexture) aiCompressed.add(t.source)
    } })
    return { href: location.href, circuit: w.settings.profile.circuit, run: w.run?.kind, screen: w.screen,
      length: g.track.length, cars: g.field?.cars.length, views: w.fview.views.length, phase: g.field?.ctrl.phase,
      tiles: ren.tiles?.total, quality: ren.q.name, ktx: window.__w11diag.ktx,
      compressedPlayerTextures: compressed.size, compressedMercedesAITextures: aiCompressed.size, playerTextures: sources.size,
      bootGPU: window.__w11diag.gpu, gridGPU: ren.gpuEstimate(), fatal: !!document.getElementById('fatal'),
      hudVisible: !document.getElementById('hud').hidden }
  })
  console.log(JSON.stringify(report.result, null, 2))
  assert.equal(report.crashes, 0, 'aucun crash du navigateur')
  assert.equal(report.result.fatal, false, 'aucun écran fatal')
  assert.equal(report.result.circuit, 'abu')
  assert.equal(report.result.run, 'quick')
  assert.equal(report.result.screen, 'drive')
  assert.ok(Math.abs(report.result.length - 5329.51861987993) < 0.01, 'vraie surface Yas')
  assert.equal(report.result.cars, 20)
  assert.equal(report.result.views, 19)
  assert.equal(report.result.tiles, 13)
  assert.equal(report.result.hudVisible, true)
  assert.equal(report.result.ktx, true, 'le fallback des textures de piste ne désactive pas KTX2 pour les voitures')
  assert.ok(report.result.compressedPlayerTextures > 0, 'la W11 mobile garde ses textures GPU compressées sur Yas')
  assert.ok(report.result.compressedMercedesAITextures > 0, 'la W11 IA ne réintroduit pas une copie de textures non compressées')
  const unexpected = report.pageErrors.filter(e => !/Unable to decode audio data/.test(e))
  assert.deepEqual(unexpected, [], 'aucune exception de démarrage hors erreurs audio déjà connues')
  console.log('TOUS LES CONTRÔLES DE DÉMARRAGE YAS PASSENT')
} catch (e) {
  report.failure = String(e)
  console.error(report.failure)
  try { report.bootText = await page.locator('#bootText').textContent() } catch {}
  console.error(JSON.stringify({ errors: report.pageErrors, lastLogs: report.logs.slice(-12) }, null, 2))
  process.exitCode = 1
} finally {
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n')
  await browser.close()
}
