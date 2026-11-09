import { chromium } from '@playwright/test'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage()
await p.goto((process.argv[3] || 'http://127.0.0.1:5199/') + '?q=' + (process.argv[2] || 'high'))
await p.waitForFunction(() => window.__w11 && window.__w11.ren.tiles.loaded.size === window.__w11.ren.tiles.total, null, { timeout: 400000, polling: 1000 })
await p.waitForTimeout(2000)
console.log(await p.evaluate(() => { const r = window.__w11.ren; const T = new Set(), S = new Set(), N = new Set(), M = new Set(); let px = 0
  r.track.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) { M.add(m); for (const k in m) { const t = m[k]; if (t && t.isTexture) { T.add(t); if (!S.has(t.source)) { S.add(t.source); px += t.image.width * t.image.height } N.add(t.name) } } } })
  return { tex: T.size, src: S.size, names: N.size, mats: M.size, mpx: px / 1e6, mem: r.r.info.memory, calls: r.r.info.render.calls, tris: r.r.info.render.triangles } }))
await b.close()
