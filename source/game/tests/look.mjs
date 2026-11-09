// Captures comparatives du rendu (même instant de la démo, caméra fixée) : node tests/look.mjs nom1:query1 nom2:query2 ...
// ex. node tests/look.mjs ref:q=high,probe=0 sonde:q=high  → ../out/look/<nom>_<cam>.png + stats de luminance
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const base = process.env.BASE || 'http://127.0.0.1:5199/', OUT = new URL('../../out/look/', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const CAMS = (process.env.CAMS || 'chase,tv').split(','), T = Number(process.env.T || 14)
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const rep = {}
for (const spec of process.argv.slice(2)) {
  const [name, qs] = spec.split(':'); const ctx = await b.newContext({ viewport: { width: 844, height: 390 } }); const p = await ctx.newPage()
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  const t0 = Date.now(); await p.goto(base + '?' + qs.replaceAll(',', '&')); await p.waitForSelector('#bootGo:not([hidden])', { timeout: 300000 })
  const load = (Date.now() - t0) / 1000
  await p.click('#bootGo'); await p.waitForTimeout(400); await p.click('[data-act=demo]'); await p.waitForTimeout(300)
  // avance déterministe de la simulation jusqu'à T s, puis pause
  await p.evaluate(T => { const w = window.__w11; w.game.paused = false; for (let i = 0; i < T * 50; i++) w.game.advance(0.02); w.game.paused = true }, T)
  rep[name] = { qs, load, errs, cams: {} }
  for (const cam of CAMS) {
    await p.evaluate(c => window.__w11.setCam(c), cam); await p.waitForTimeout(2500)
    await p.evaluate(() => document.querySelectorAll('#hud,.hud,#touch,#controls').forEach(e => e.style.visibility = 'hidden'))
    const f = `${OUT}${name}_${cam}.png`; await p.screenshot({ path: f })
    const st = await p.evaluate(async src => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = 211; c.height = 98
      const x = c.getContext('2d'); x.drawImage(im, 0, 0, 211, 98); const d = x.getImageData(0, 0, 211, 98).data; const L = []
      for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); L.sort((a, b) => a - b)
      const q = k => L[Math.floor(k * (L.length - 1))]; return { p2: q(0.02), p50: q(0.5), p98: q(0.98), clip: L.filter(v => v > 250).length / L.length } },
      'data:image/png;base64,' + fs.readFileSync(f).toString('base64')).catch(e => String(e))
    rep[name].cams[cam] = st
  }
  rep[name].info = await p.evaluate(() => { const r = window.__w11.ren; return { bakedAO: r.bakedAO, probe: r.probe ? r.probe.rt.width : 0, q: r.q.name, calls: r.r.info.render.calls, tris: r.r.info.render.triangles } })
  console.log(name, JSON.stringify(rep[name])); await ctx.close()
}
fs.writeFileSync(OUT + 'look_' + Date.now() + '.json', JSON.stringify(rep, null, 1)); await b.close()
