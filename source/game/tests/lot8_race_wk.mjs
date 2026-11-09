// Lot 8 C : course avec 19 IA — WebKit iPhone 13 : node tests/lot8_race_wk.mjs URL prefixe
import { webkit } from '@playwright/test'
const [url, pre] = process.argv.slice(2)
const b = await webkit.launch()
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const p = await ctx.newPage(); const errs = [], logs = []
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); else if (/plateau|commissaires|GPU/.test(m.text())) logs.push(m.text()) })
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's'
await p.goto(url); await p.waitForFunction(() => window.__w11 && !document.getElementById('bootGo')?.hidden, null, { timeout: 300000 })
await p.evaluate(() => { localStorage.removeItem('w11.weekend.v1'); document.getElementById('bootGo').click() }); await p.waitForTimeout(2500)
const shot = async n => { await p.evaluate(() => { for (const e of document.querySelectorAll('#controls')) e.style.visibility = 'hidden' }); await p.screenshot({ path: `/workspace/w11/out/wk/${pre}_${n}.png` }); await p.evaluate(() => { for (const e of document.querySelectorAll('#controls')) e.style.visibility = '' }); console.log(T(), 'capture', n) }
const mem = () => p.evaluate(() => { const r = window.__w11.ren, e = r.gpuEstimate(), Mo = x => Math.round(x / 1048576); return { tex: r.r.info.memory.textures, geo: r.r.info.memory.geometries, est: Mo(e.total), estTex: Mo(e.tex), estGeo: Mo(e.geo), tris: r.r.info.render.triangles, calls: r.r.info.render.calls } })
const adv = (sec, auto = true) => p.evaluate(([sec, auto]) => { const w = window.__w11, g = w.game; g.autopilot = auto; const n = Math.round(sec * 30); for (let k = 0; k < n; k++) { g.advance(1 / 30); if (w.fview && g.field) w.fview.update(g.field, 1 / 30, w.ren.cams.cam) } }, [sec, auto])
const M = { mem0: await mem() }
await p.evaluate(() => { const w = window.__w11; w.settings.profile.laps = 3; w.startQuick() })
await p.waitForFunction(() => window.__w11.fview?.ready, null, { timeout: 240000 }); console.log(T(), 'plateau prêt')
await p.waitForTimeout(3000)
M.memGrid = await mem()
await p.evaluate(() => window.__w11.setCam('tv')); await p.waitForTimeout(1500); await shot('grille_tv')
await p.evaluate(() => window.__w11.setCam('chase')); await p.waitForTimeout(1500); await shot('grille_poursuite')
// tour de formation : 25 s puis passer
await adv(25, false); await p.waitForTimeout(1500); await shot('formation')
M.phase1 = await p.evaluate(() => window.__w11.game.field.ctrl.phase)
await p.evaluate(() => window.__w11.skipFormation()); await adv(1, false); await p.waitForTimeout(500)
for (let k = 0; k < 40 && (await p.evaluate(() => window.__w11.game.field.ctrl.phase)) !== 'lights'; k++) await adv(0.5, false)
await adv(2.2, false); await p.waitForTimeout(800); await shot('feux')
for (let k = 0; k < 40 && (await p.evaluate(() => window.__w11.game.field.ctrl.phase)) !== 'racing'; k++) await adv(0.5, false)
await adv(7); await p.evaluate(() => window.__w11.setCam('tv')); await p.waitForTimeout(4000); await shot('depart_la_source'); await p.evaluate(() => window.__w11.setCam('chase'))
await adv(30); await p.waitForTimeout(9000); await shot('course_poursuite')
await p.evaluate(() => window.__w11.setCam('tv')); await p.waitForTimeout(1500); await shot('course_tv')
await p.evaluate(() => { const t = window.__w11.tower; t.open = true; t.update(1) }); await p.waitForTimeout(800); await shot('tour_chrono')
M.memRace = await mem(); M.field = await p.evaluate(() => { const g = window.__w11.fview.gpuBytes(); return { texMB: +(g.tex / 1048576).toFixed(1), geoMB: +(g.geo / 1048576).toFixed(1) } })
M.state = await p.evaluate(() => { const F = window.__w11.game.field; return { t: F.t, phase: F.ctrl.phase, pl: { pos: F.player.pos, laps: F.player.laps }, msgs: F.msgs.slice(-12).map(m => m.text), top: F.ordered().slice(0, 6).map(r => r.code + ' ' + r.laps + ' ' + r.dist.toFixed(0)) } })
console.log(JSON.stringify({ M, logs: logs.slice(-8), errs: errs.slice(0, 10) }, null, 1))
await b.close()
