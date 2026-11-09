// Vérifie le fichier HTML unique ouvert en file:// (pas de serveur). Usage : node tests/single.mjs [fichier]
import { chromium } from '@playwright/test'
import path from 'node:path'
const f = path.resolve(process.argv[2] || '../out/PROJECT_W11_single.html')
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })).newPage()
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
const t0 = Date.now()
await p.goto('file://' + f + '?q=low')
await p.waitForSelector('#bootGo:not([hidden])', { timeout: 300000 })
console.log('chargé en', ((Date.now() - t0) / 1000).toFixed(1), 's')
await p.click('#bootGo'); await p.waitForTimeout(500)
await p.click('[data-act=demo]'); await p.waitForTimeout(4000)
await p.screenshot({ path: '../out/app/single_file_demo.png' })
const st = await p.evaluate(() => ({ v: window.__w11.game.car.speed * 3.6, single: !!window.__W11_SINGLE }))
console.log('vitesse', st.v.toFixed(0), 'km/h · single', st.single, '· erreurs', errs.length, errs.slice(0, 3))
await b.close()
process.exit(errs.length || !st.single ? 1 : 0)
