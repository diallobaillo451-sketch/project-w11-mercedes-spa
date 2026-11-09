import { chromium } from '@playwright/test'
const url = process.argv[2] || 'http://127.0.0.1:5199/?auto=demo&q=medium'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 })).newPage()
p.on('pageerror', e => console.log('PAGEERR', String(e)))
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text()) })
const t0 = Date.now()
await p.goto(url)
await p.waitForFunction(() => window.__w11, null, { timeout: 240000 })
console.log('loaded', (Date.now() - t0) / 1000)
await p.waitForTimeout(4000)
await p.screenshot({ path: '/tmp/w11_smoke.png' })
console.log(await p.evaluate(() => { const g = window.__w11.game; return JSON.stringify({ s: g.car.s, v: g.car.speed, cam: window.__w11.ren.cams.mode }) }))
await b.close()
