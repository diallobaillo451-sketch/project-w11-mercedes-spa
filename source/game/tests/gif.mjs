// Capture d'images d'un tour de démo (sim pas fixe, rendu SwiftShader) → GIF/MP4 dans ../out/app/
import { chromium } from '@playwright/test'
import fs from 'node:fs'; import { execSync } from 'node:child_process'
const OUT = new URL('../../out/app/', import.meta.url).pathname, FR = '/tmp/w11frames'
fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR)
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })).newPage()
await p.goto('http://127.0.0.1:5199/?q=medium')
await p.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
await p.click('#bootGo'); await p.waitForTimeout(500)
await p.click('[data-act=demo]'); await p.waitForTimeout(500)
await p.evaluate(() => { const w = window.__w11; w.fixedDt = 0.024; w.setCam('chase') })
const N = +(process.argv[2] || 90), cams = ['chase', 'tcam', 'tv', 'cockpit']
for (let i = 0; i < N; i++) {
  await p.evaluate(i => { const w = window.__w11; for (let k = 0; k < 3; k++) w.game.advance(0.024); if (i % 30 === 0) w.setCam(['chase', 'tcam', 'tv', 'cockpit'][(i / 30) % 4 | 0]) }, i)
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  await p.screenshot({ path: `${FR}/f${String(i).padStart(4, '0')}.png` })
}
await b.close(); void cams
execSync(`ffmpeg -y -loglevel error -framerate 12 -i ${FR}/f%04d.png -vf "scale=640:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer" ${OUT}demo_tour.gif`)
execSync(`ffmpeg -y -loglevel error -framerate 12 -i ${FR}/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 23 ${OUT}demo_tour.mp4`)
for (const f of ['demo_tour.gif', 'demo_tour.mp4']) console.log(f, (fs.statSync(OUT + f).size / 1e6).toFixed(2), 'Mo')
