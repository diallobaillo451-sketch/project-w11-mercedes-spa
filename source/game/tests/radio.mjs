// Radio : banque chargée, décodage AAC, assemblage, bulle HUD (Chromium, son autorisé sans geste) → out/app/radio_bulle.png
import { chromium } from '@playwright/test'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || /radio/.test(m.text())) errs.push(m.text()) })
await p.goto(process.argv[2] || 'http://127.0.0.1:5199/'); await p.waitForSelector('#bootGo:not([hidden])', { timeout: 300000 })
await p.evaluate(() => document.getElementById('bootGo').click()); await p.waitForTimeout(3000)
await p.evaluate(() => window.__w11.startSession('timetrial')); await p.waitForTimeout(2500)
await p.waitForSelector('.radiob.on', { timeout: 15000 }); await p.waitForTimeout(400); await p.screenshot({ path: '../out/app/radio_bulle.png' })
const shown = await p.evaluate(() => { const e = document.querySelector('.radiob'), cs = getComputedStyle(e), r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), text: e.querySelector('span').textContent, op: cs.opacity, disp: cs.display, r: [r.x, r.y, r.width, r.height], par: e.parentElement.tagName } })

const r = await p.evaluate(async () => { const g = window.__w11, rd = g.radio
  return { log: window.__w11diag.log.filter(l => /radio|audio/.test(l)) } })
console.log(JSON.stringify({ shown, r, errs: errs.slice(0, 8) }, null, 1)); await b.close()
