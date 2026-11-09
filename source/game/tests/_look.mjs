import { chromium } from '@playwright/test'
import sharp from 'sharp'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const cam = process.argv[2]; const vars = process.argv.slice(3); const files = []
for (const [i, v] of vars.entries()) {
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage()
  p.on('pageerror', e => console.log('PAGEERR', String(e)))
  await p.goto('http://127.0.0.1:5199/?auto=demo&' + v)
  await p.waitForFunction(() => window.__w11, null, { timeout: 240000 })
  await p.evaluate(c => { window.__w11.setCam(c); document.getElementById('hud').hidden = true }, cam)
  await p.waitForTimeout(2500)
  const f = `/tmp/look${i}.png`; await p.screenshot({ path: f }); files.push(f); await p.close()
}
const comp = files.map((f, i) => ({ input: f, top: i * 390, left: 0 }))
await sharp({ create: { width: 844, height: 390 * files.length, channels: 3, background: '#000' } }).composite(comp).png().toFile('/tmp/look.png')
await b.close()
