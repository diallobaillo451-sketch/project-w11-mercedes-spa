// Lot 6 : pluie, traces, dégâts, débris — WebKit émulation iPhone 13 : node tests/lot6_wk.mjs URL prefixe
import { webkit } from '@playwright/test'
const [url, pre] = process.argv.slice(2)
const b = await webkit.launch()
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(url); await p.waitForFunction(() => window.__w11 && !document.getElementById('bootGo')?.hidden, null, { timeout: 300000 })
await p.evaluate(() => document.getElementById('bootGo').click()); await p.waitForTimeout(1500)
await p.evaluate(() => window.__w11.startSession('practice')).catch(() => {})
const shot = async n => { await p.evaluate(() => { for (const e of document.querySelectorAll('#controls,.toast')) e.style.visibility = 'hidden' }); await p.screenshot({ path: `/workspace/w11/out/wk/${pre}_${n}.png` }); await p.evaluate(() => { for (const e of document.querySelectorAll('#controls,.toast')) e.style.visibility = '' }) }
const M = {}
const sim = (sec) => p.evaluate(n => { const g = window.__w11.game; for (let i = 0; i < n; i++) g.advance(1 / 120) }, Math.round(sec * 120))
// 1) sec : freinage bloqué -> traces
await p.evaluate(() => { const w = window.__w11; w.__w11 = 1; w.game.car.placeAt(6600, 0, 0); w.game.snapshot(); w.game.autopilot = true; w.setCam('chase') })
await sim(10)
await p.evaluate(() => { const w = window.__w11; w.game.autopilot = false; w.game.ctl.throttle = 0; w.game.ctl.brake = 1; w.game.ctl.steer = 0.25; w.game.car.setup.abs = false })
await sim(3)
await p.evaluate(() => { const w = window.__w11; w.setCam('free'); const c = w.ren.cams; c.orbitYaw = 3.0; c.orbitPitch = 0.3; c.orbitDist = 14 })
await p.waitForTimeout(3000); await shot('traces_sec')
M.sec = await p.evaluate(() => { const g = window.__w11.game; return { kmh: Math.round(g.car.speed * 3.6), flat: g.car.wheels.map(w => +w.tyre.flatSpot.toFixed(2)) } })
// 2) pluie forte, pneus pluie, roulage autopilote
await p.evaluate(() => { const w = window.__w11; w.game.setWeather('rain'); w.game.car.fitTyres('W', 60, 60); w.game.car.placeAt(1300, 0, 0); w.game.snapshot(); w.game.autopilot = true; w.setCam('chase') })
await sim(25); await p.waitForTimeout(6000); await shot('pluie_chase')
await p.evaluate(() => window.__w11.setCam('cockpit')); await p.waitForTimeout(5000); await shot('pluie_cockpit')
M.pluie = await p.evaluate(() => { const g = window.__w11.game, e = g.env, c = g.car; return { kmh: Math.round(c.speed * 3.6), rain: e.rainRate, wetness: +e.wetness.toFixed(2), water: +e.water[e.idx(c.s, c.d)].toFixed(2), wetGrip: +c.wetGrip.toFixed(2), aqua: +c.aqua.toFixed(2), tyre: c.wheels.map(w => Math.round(w.tyre.core)) } })
// 3) choc : lancé dans le mur à La Source
await p.evaluate(() => { const w = window.__w11; w.game.setWeather('dry'); w.game.car.fitTyres('C3', 100, 80); const car = w.game.car; car.placeAt(300, 0, 85); const yaw = 0.42, cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), [qx, qy, qz, qw] = car.q; car.q = [cy * qx + sy * qz, cy * qy + sy * qw, cy * qz - sy * qx, cy * qw - sy * qy]; const c = Math.cos(yaw), sn = Math.sin(yaw), vx = car.vel[0], vz = car.vel[2]; car.vel[0] = c * vx + sn * vz; car.vel[2] = -sn * vx + c * vz; w.game.snapshot(); w.game.autopilot = false; w.game.ctl.throttle = 0.6; w.game.ctl.brake = 0; w.game.ctl.steer = 0; w.setCam('chase') })
await sim(4)
await p.evaluate(() => { const g = window.__w11.game, d = g.car.damage; window.__dmgReal = JSON.stringify(d); if (d.total < 0.5) { d.frontWing = 1; d.endplate[0] = 1; d.barge[0] = 0.7; d.rearWing = 0.4; d.wheelOff[0] = true; d.total = 1; g.car.emitDebris([]) } g.ctl.throttle = 0; g.ctl.brake = 1; g.ctl.steer = 0 })
await sim(2)
await p.evaluate(() => { const w = window.__w11; w.setCam('free'); const c = w.ren.cams; c.orbitYaw = 2.2; c.orbitPitch = 0.25; c.orbitDist = 9 })
await p.waitForTimeout(3000); await shot('degats')
M.choc = await p.evaluate(() => { const g = window.__w11.game, d = g.car.damage; return { reel: window.__dmgReal, total: +d.total.toFixed(2), fw: +d.frontWing.toFixed(2), ep: d.endplate.map(x => +x.toFixed(2)), rw: +d.rearWing.toFixed(2), off: d.wheelOff, punct: g.car.wheels.map(w => +w.tyre.puncture.toFixed(2)), debris: g.debris.length } })
await p.evaluate(() => { const w = window.__w11; w.setCam('cockpit'); if (w.wheel) w.wheel.page = 2 }); await p.waitForTimeout(2500); await shot('volant_degats')
const st = await p.evaluate(() => { const r = window.__w11.ren; return { canvas: r.canvas.width + 'x' + r.canvas.height, pr: r.r.getPixelRatio(), gpu: window.__w11diag.gpu, preset: window.__w11diag.preset, fps: window.__w11diag.fps } })
console.log(JSON.stringify({ M, st, errs: errs.slice(0, 8) }))
await b.close()
