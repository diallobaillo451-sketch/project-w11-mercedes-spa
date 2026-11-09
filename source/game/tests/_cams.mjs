import { chromium } from '@playwright/test'
import sharp from 'sharp'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage()
p.on('pageerror', e => console.log('PAGEERR', String(e)))
p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()) })
await p.goto('http://127.0.0.1:5199/?auto=demo&' + (process.argv[2] || 'q=medium'))
await p.waitForFunction(() => window.__w11, null, { timeout: 240000 })
await p.waitForTimeout(1500)
const cams = ['chase', 'close', 'tcam', 'cockpit', 'tv', 'free']; const files = []
for (const c of cams) { await p.evaluate(c => window.__w11.setCam(c), c); await p.waitForTimeout(1200); const f = `/tmp/cam_${c}.png`; await p.screenshot({ path: f }); files.push(f) }
await sharp({ create: { width: 844 * 2, height: 390 * 3, channels: 3, background: '#000' } }).composite(files.map((f, i) => ({ input: f, left: (i % 2) * 844, top: Math.floor(i / 2) * 390 }))).png().toFile('/tmp/cams.png')
await b.close()
