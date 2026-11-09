import { chromium } from '@playwright/test'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage()
p.on('pageerror', e => console.log('PAGEERR', String(e)))
await p.goto('http://127.0.0.1:5199/?auto=demo&' + process.argv[2])
await p.waitForFunction(() => window.__w11, null, { timeout: 240000 })
await p.waitForTimeout(1500)
for (const [i, js] of process.argv.slice(3).entries()) { const r = await p.evaluate(js); if (r !== undefined) console.log(typeof r === 'string' ? r : JSON.stringify(r)); await p.waitForTimeout(700); await p.screenshot({ path: `/tmp/ev${i}.png` }) }
await b.close()
