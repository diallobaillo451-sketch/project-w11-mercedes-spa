// Captures fixes (avant/après) : node tests/shots.mjs URL prefixe [W H dpr] [ios]
// place la voiture à l'abscisse s, attend le streaming, capture selon la caméra.
import { chromium } from '@playwright/test'
const [url, pre, W = '844', H = '390', dpr = '2', ios = ''] = process.argv.slice(2)
const SHOTS = (process.env.SHOTS ? JSON.parse(process.env.SHOTS) : [
  ['depart_chase', 6880, 0, 'chase'], ['depart_cockpit', 6880, 0, 'cockpit'], ['lasource_tv', 330, 0, 'tv'],
  ['eaurouge_free', 880, 0, 'free', 2.3, 0.18, 16], ['raidillon_free', 1050, 0, 'free', -2.2, 0.12, 22], ['raidillon_chase', 1000, 0, 'chase'],
  ['kemmel_cockpit', 1500, 0, 'cockpit'], ['paddock_free', 6800, 0, 'free', 1.4, 0.25, 30]])
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dpr, ...(ios ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } : {}) })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(url); await p.waitForFunction(() => window.__w11 && !document.getElementById('bootGo')?.hidden, null, { timeout: 300000 })
await p.click('#bootGo'); await p.waitForTimeout(1500)
await p.evaluate(() => window.__w11.startSession('practice')).catch(() => {})
for (const [name, s, d, cam, yaw, pitch, dist] of SHOTS) {
  await p.evaluate(([s, d, cam, yaw, pitch, dist]) => { const w = window.__w11; w.game.autopilot = false; w.game.ctl.throttle = 0; w.game.ctl.brake = 1
    w.game.car.placeAt(s, d, 0); w.game.snapshot(); w.setCam(cam); const c = w.ren.cams; if (cam === 'free') { c.orbitYaw = yaw; c.orbitPitch = pitch; c.orbitDist = dist } }, [s, d, cam, yaw, pitch, dist])
  await p.waitForTimeout(+(process.env.WAIT || 9000))
  await p.evaluate(() => { for (const e of document.querySelectorAll('#controls,.toast')) e.style.visibility = 'hidden' })
  await p.screenshot({ path: `/workspace/w11/out/shots/${pre}_${name}.png` })
  await p.evaluate(() => { for (const e of document.querySelectorAll('#controls,.toast')) e.style.visibility = '' })
}
const st = await p.evaluate(() => { const r = window.__w11.ren; return { calls: r.r.info.render.calls, tris: r.r.info.render.triangles, mem: r.r.info.memory, gpu: window.__w11diag.gpu, preset: window.__w11diag.preset, fps: window.__w11diag.fps } })
console.log(JSON.stringify({ st, errs: errs.slice(0, 8) }))
await b.close()
