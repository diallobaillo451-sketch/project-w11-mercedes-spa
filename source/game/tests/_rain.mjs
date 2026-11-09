import { webkit } from '@playwright/test'
const b = await webkit.launch(); const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const p = await ctx.newPage(); await p.goto(process.argv[2]); await p.waitForFunction(() => window.__w11 && !document.getElementById('bootGo')?.hidden, null, { timeout: 300000 })
await p.evaluate(() => document.getElementById('bootGo').click()); await p.waitForTimeout(1500); await p.evaluate(() => window.__w11.startSession('practice')).catch(() => {})
await p.evaluate(() => { const w = window.__w11; w.game.setWeather('rain'); w.game.car.fitTyres('W', 60, 60); w.game.car.placeAt(6750, 0, 40); w.game.snapshot(); w.game.autopilot = true; w.setCam('chase') })
await p.evaluate(n => { const g = window.__w11.game; for (let i = 0; i < n; i++) g.advance(1 / 120) }, 600)
const P = process.argv[3] || 'rt'
const hide = v => p.evaluate(v => { for (const e of document.querySelectorAll('#controls,.toast')) e.style.visibility = v }, v)
await p.waitForTimeout(12000); await hide('hidden'); await p.screenshot({ path: `/workspace/w11/out/wk/${P}_pluie_chase.png` }); await hide('')
await p.evaluate(() => window.__w11.setCam('cockpit')); await p.waitForTimeout(7000); await hide('hidden'); await p.screenshot({ path: `/workspace/w11/out/wk/${P}_pluie_cockpit.png` }); await hide('')
console.log(JSON.stringify(await p.evaluate(() => { const g = window.__w11.game, e = g.env, c = g.car; return { kmh: Math.round(c.speed * 3.6), water: +e.water[e.idx(c.s, c.d)].toFixed(2), wetGrip: +c.wetGrip.toFixed(2), drs: c.drsAvailable, gpu: Math.round(window.__w11diag.gpu.total / 1e6) } })))
await b.close()
