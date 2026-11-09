// Lot 7 : menu Apple, pilotes 2020, week-end (garage, résultats), course rapide — WebKit iPhone 13 : node tests/lot7_wk.mjs URL prefixe
import { webkit } from '@playwright/test'
const [url, pre] = process.argv.slice(2)
const b = await webkit.launch()
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: process.env.LIGHT ? 'light' : 'dark', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's'
await p.goto(url); await p.waitForFunction(() => window.__w11 && !document.getElementById('bootGo')?.hidden, null, { timeout: 300000 })
await p.evaluate(() => { localStorage.removeItem('w11.weekend.v1'); document.getElementById('bootGo').click() }); await p.waitForTimeout(2500)
const shot = async n => { await p.evaluate(() => { for (const e of document.querySelectorAll('#controls,.toast')) e.style.visibility = 'hidden' }); await p.screenshot({ path: `/workspace/w11/out/wk/${pre}_${n}.png` }); await p.evaluate(() => { for (const e of document.querySelectorAll('#controls,.toast')) e.style.visibility = '' }); console.log(T(), 'capture', n) }
const M = {}
const settle = () => p.evaluate(() => { const r = window.__w11.ren; for (let i = 0; i < 160; i++) r.show.update(0.04, innerWidth / innerHeight, r.showPanel) })
M.mem0 = await p.evaluate(() => { const r = window.__w11.ren; return { tex: r.r.info.memory.textures, geo: r.r.info.memory.geometries } })
await settle(); await p.waitForTimeout(1500); await shot('accueil')
// fps du menu (vitrine)
M.menuFps = await p.evaluate(() => new Promise(res => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 3000) requestAnimationFrame(f); else res(+(n * 1000 / (performance.now() - s)).toFixed(1)) }; requestAnimationFrame(f) }))
// course rapide → pilote
await p.click('.ap-tile >> nth=0'); await p.waitForTimeout(1500); await shot('pilotes')
await p.evaluate(() => document.querySelector('.ap-page:not(.out-l)').scrollTop = 420); await p.waitForTimeout(600); await shot('pilotes_bas')
for (const id of ['ver', 'lec', 'nor', 'rus']) {
  await p.evaluate(id => { const b = [...document.querySelectorAll('.ap-drv')].find(x => x.querySelector('img').src.includes('/' + id + '.webp')); b.scrollIntoView({ block: 'center' }); b.click() }, id)
  await settle(); await p.waitForTimeout(2600); await shot('casque_' + id)
}
await p.evaluate(() => window.__w11.ren.show.setShot('driver')); await settle(); await p.waitForTimeout(2000); await shot('pilote_rus')
// étapes suivantes
for (const n of ['circuit', 'voiture', 'session']) { await p.click('.ap-foot .ap-btn'); await settle(); await p.waitForTimeout(2000); await shot(n) }
// course rapide : 1 tour, départ (feux)
await p.evaluate(() => { const w = window.__w11; w.settings.profile.laps = 1 })
await p.click('.ap-foot .ap-btn'); await p.waitForTimeout(2600); await shot('feux')
M.race = await p.evaluate(() => { const w = window.__w11; return { screen: w.screen, kind: w.game.session.kind, fuel: +w.game.car.fuel.toFixed(1), lights: [...document.querySelectorAll('#lights i.on')].length } })
M.memRace = await p.evaluate(() => { const r = window.__w11.ren, e = r.gpuEstimate(), Mo = x => Math.round(x / 1048576); return { tex: r.r.info.memory.textures, geo: r.r.info.memory.geometries, est: Mo(e.total), estTex: Mo(e.tex), show: r.show.active } })
// laisser l'autopilote boucler le tour (simulation rapide)
await p.evaluate(() => { const w = window.__w11; w.game.autopilot = true })
await p.evaluate(() => new Promise(res => { const w = window.__w11, g = w.game; let i = 0; const step = () => { for (let k = 0; k < 600 && w.screen === 'drive'; k++) { g.advance(1 / 120); i++ } if (w.screen === 'drive' && i < 120 * 200) setTimeout(step, 0); else res() }; step() }))
await p.waitForTimeout(6000); await settle(); await p.waitForTimeout(1500)
M.raceEnd = await p.evaluate(() => { const w = window.__w11; return { screen: w.screen, laps: w.game.session.timing.laps.length, total: document.querySelector('.rs-big b')?.textContent } })
await shot('resultats_course')
// week-end : retour menu, nouveau week-end court
await p.evaluate(() => { const w = window.__w11; w.game.autopilot = false; const P = w.settings.profile; P.shortWeekend = true; P.fpMin = [20, 20, 3]; w.menu.reset(); w.setScreen('menu') })
await settle(); await p.waitForTimeout(2000); await shot('accueil_retour')
await p.evaluate(() => window.__w11.startWeekend(true)); await settle(); await p.waitForTimeout(2000); await shot('garage')
M.garage = await p.evaluate(() => { const w = window.__w11; return { screen: w.screen, cur: w.wk.cur, rem: w.run.remaining } })
await p.click('.gx-cta .ap-btn >> nth=1'); await p.waitForTimeout(1500)
M.fp3 = await p.evaluate(() => { const w = window.__w11; return { screen: w.screen, kind: w.game.session.kind, sess: document.getElementById('hSess').textContent } })
await shot('el3_piste')
// roulage autopilote ~ 2 tours, puis arrêt au stand simulé → garage avec propositions
await p.evaluate(() => { const w = window.__w11; w.game.autopilot = true })
await p.evaluate(() => new Promise(res => { const w = window.__w11, g = w.game; let i = 0; const step = () => { for (let k = 0; k < 600; k++) { g.advance(1 / 120); w.__tick?.(); i++ } if (i < 120 * 150) setTimeout(step, 0); else res() }; step() }))
M.fp3run = await p.evaluate(() => { const w = window.__w11; return { laps: w.game.session.timing.laps.length, best: w.game.session.timing.best?.time, n: w.run.tel.n } })
// télémétrie de séance injectée (en WebKit logiciel le jeu tourne à ~1 i/s : l'échantillonnage par image ne voit presque rien)
await p.evaluate(() => { const w = window.__w11, n = 6000; w.run.tel = { ...w.run.tel, n, tF: 112 * n, tR: 121 * n, tMaxF: 125, tMaxR: 131, vmax: 88.6, lockups: 4, scrapeT: 5.2, snapRear: 14, pushFront: 3, brakeMax: 980, laps: 3, distance: 21000 } })
await p.evaluate(() => { const w = window.__w11; w.game.autopilot = false; w.openGarage() }); await settle(); await p.waitForTimeout(2000); await shot('garage_ingenieur')
M.props = await p.evaluate(() => [...document.querySelectorAll('.gx-prop .tx b')].map(e => e.textContent))
await p.evaluate(() => { [...document.querySelectorAll('.ap-seg button')].find(b => b.textContent === 'Réglages').click() }); await p.waitForTimeout(800); await shot('garage_reglages')
await p.evaluate(() => { [...document.querySelectorAll('.ap-seg button')].find(b => b.textContent === 'Ingénieur').click() }); await p.waitForTimeout(500)
const ap = await p.$('.ap-page .ap-btn'); if (ap) { await ap.click(); await p.waitForTimeout(1500); await shot('garage_mecanos'); await p.waitForTimeout(6000) }
M.afterPrep = await p.evaluate(() => { const w = window.__w11, S = w.settings.setup; return { rem: Math.round(w.run.remaining), wingF: S.wingF, wingR: S.wingR, rideR: S.rideR, comp: S.compound } })
await p.evaluate(() => [...document.querySelectorAll('.ap-seg button')].find(b => b.textContent === 'Temps').click()); await p.waitForTimeout(600); await shot('garage_temps')
await p.evaluate(() => window.__w11.endSession()); await settle(); await p.waitForTimeout(2000); await shot('resultats_el3')
M.after = await p.evaluate(() => { const w = window.__w11; return { screen: w.screen, cur: w.wk.cur, results: w.wk.st.results.map(r => r.id + ':' + r.best) } })
const st = await p.evaluate(() => { const r = window.__w11.ren; return { canvas: r.canvas.width + 'x' + r.canvas.height, preset: window.__w11diag.preset } })
console.log(JSON.stringify({ M, st, errs: errs.slice(0, 10) }, null, 1))
await b.close()
