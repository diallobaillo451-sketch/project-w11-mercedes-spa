import { chromium } from '@playwright/test'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage()
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto('http://127.0.0.1:5199/?q=high&auto=demo')
await p.waitForFunction(() => window.__w11 && window.__w11.ren.tiles.loaded.size === 13, null, { timeout: 300000, polling: 500 })
for (const lv of [0, 1, 2, 3, 0]) {
  const st = await p.evaluate(lv => { const r = window.__w11.ren; r.setFx(lv); return { fx: r.fxLevel, gtao: r.gtao?.enabled, bloom: r.bloom?.enabled, sm: r.sun.shadow.mapSize.x } }, lv)
  await p.waitForTimeout(1500); await p.screenshot({ path: `/workspace/w11/out/app/fx_niveau${lv}.png` }); console.log(lv, JSON.stringify(st))
}
// échelle adaptative : simulation de 400 images lentes (30 ms) → paliers
const lad = await p.evaluate(async () => { const { AdaptiveResolution } = await import('/src/quality/quality.ts'); const a = new AdaptiveResolution(); const seq = []
  for (let i = 0; i < 3000; i++) if (a.sample(30)) seq.push([a.scale, a.fx]); for (let i = 0; i < 3000; i++) if (a.sample(10)) seq.push([a.scale, a.fx]); return seq })
console.log('paliers', JSON.stringify(lad)); console.log('erreurs', errs)
await b.close()
