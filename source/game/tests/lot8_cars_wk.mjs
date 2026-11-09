// Lot 8 A : voitures d'équipe 2020 dans la vitrine + en piste — WebKit iPhone 13 : node tests/lot8_cars_wk.mjs URL prefixe [ids]
import { webkit } from '@playwright/test'
const [url, pre, list] = process.argv.slice(2)
const IDS = (list ?? 'redbull,ferrari,mclaren,renault,alphatauri,racingpoint,alfaromeo,haas,williams').split(',')
const b = await webkit.launch()
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's'
await p.goto(url); await p.waitForFunction(() => window.__w11 && !document.getElementById('bootGo')?.hidden, null, { timeout: 300000 })
await p.evaluate(() => { localStorage.removeItem('w11.weekend.v1'); document.getElementById('bootGo').click() }); await p.waitForTimeout(2500)
const shot = async n => { await p.evaluate(() => { for (const e of document.querySelectorAll('#controls,.toast')) e.style.visibility = 'hidden' }); await p.screenshot({ path: `/workspace/w11/out/wk/${pre}_${n}.png` }); await p.evaluate(() => { for (const e of document.querySelectorAll('#controls,.toast')) e.style.visibility = '' }); console.log(T(), 'capture', n) }
const settle = () => p.evaluate(() => { const r = window.__w11.ren; for (let i = 0; i < 160; i++) r.show.update(0.04, innerWidth / innerHeight, r.showPanel) })
const mem = () => p.evaluate(() => { const r = window.__w11.ren, e = r.gpuEstimate(), Mo = x => Math.round(x / 1048576); return { car: r.carId, tex: r.r.info.memory.textures, geo: r.r.info.memory.geometries, est: Mo(e.total), estTex: Mo(e.tex) } })
const M = { mem: [] }
M.mem.push(await mem())
for (const id of IDS) {
  await p.evaluate(id => window.__w11.ren.setCar(id), id)
  await p.evaluate(() => window.__w11.ren.show.setShot('hero')); await settle(); await p.waitForTimeout(2500); await shot('vitrine_' + id)
  M.mem.push(await mem())
}
await p.evaluate(() => window.__w11.ren.show.setShot('driver')); await settle(); await p.waitForTimeout(2000); await shot('pilote_' + IDS.at(-1))
await p.evaluate(() => window.__w11.ren.show.setShot('rear')); await settle(); await p.waitForTimeout(2000); await shot('arriere_' + IDS.at(-1))
// menu Voiture : choisir Ferrari → pilote Ferrari
await p.click('.ap-tile >> nth=0'); await p.waitForTimeout(1200)
await p.click('.ap-foot .ap-btn'); await settle(); await p.waitForTimeout(800); await p.click('.ap-foot .ap-btn'); await settle(); await p.waitForTimeout(1500)
await p.evaluate(() => { const r = [...document.querySelectorAll('.ap-row')].find(x => /Ferrari SF1000/.test(x.textContent)); r?.click() })
await p.waitForTimeout(4000); await settle(); await p.waitForTimeout(1500); await shot('menu_voiture')
M.pick = await p.evaluate(() => { const w = window.__w11; return { car: w.settings.profile.car, driver: w.settings.profile.driver, ren: w.ren.carId } })
// en piste : course rapide 1 tour, vues poursuite / cockpit
await p.evaluate(() => { window.__w11.settings.profile.laps = 1 })
await p.click('.ap-foot .ap-btn'); await p.waitForTimeout(1500); await p.click('.ap-foot .ap-btn'); await p.waitForTimeout(3000); await shot('piste_depart')
await p.evaluate(() => { const w = window.__w11; w.game.autopilot = true; const g = w.game; for (let k = 0; k < 120 * 14; k++) g.advance(1 / 120) }); await p.waitForTimeout(3000); await shot('piste_roule')
await p.evaluate(() => { window.__w11.setCam('cockpit') }); await p.waitForTimeout(3000); await shot('piste_cockpit')
M.memRace = await mem()
console.log(JSON.stringify({ M, errs: errs.slice(0, 10) }, null, 1))
await b.close()
