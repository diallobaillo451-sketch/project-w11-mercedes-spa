// Budget mémoire GPU (estimation indépendante, calculée dans la page) — profil iPhone 844×390 @3, Chromium swiftshader.
import { chromium } from '@playwright/test'
const base = process.argv[2] || 'http://127.0.0.1:5299/', W = +(process.argv[3] || 844), H = +(process.argv[4] || 390)
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Mobile/15E148 Safari/604.1' })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
const est = () => {
  const ren = window.__w11.ren, src = new Set(), geos = new Set(); let tex = 0, geo = 0, tris = 0, carTex = 0
  const tb = t => t.isCompressedTexture ? t.mipmaps.reduce((a, m) => a + (m.data?.byteLength ?? 0), 0) : (t.image?.width ? t.image.width * t.image.height * 4 * 1.33 : 0)
  ren.scene.traverse(o => { if (!o.isMesh) return
    if (!geos.has(o.geometry)) { geos.add(o.geometry); for (const a of Object.values(o.geometry.attributes)) geo += a.array?.byteLength ?? 0; geo += o.geometry.index?.array.byteLength ?? 0; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 }
    let inCar = false; for (let q = o; q; q = q.parent) if (q === ren.car) inCar = true
    for (const mt of [].concat(o.material)) for (const v of Object.values(mt)) if (v && v.isTexture && !src.has(v.source)) { src.add(v.source); const n = tb(v); tex += n; if (inCar) carTex += n } })
  const c = ren.canvas, M = x => Math.round(x / 1048576), m = ren.r.info.memory
  return { texMB: M(tex), carTexMB: M(carTex), geoMB: M(geo), tris: Math.round(tris), canvas: c.width + '×' + c.height, composer: !!ren.composer, shadow: ren.sun.shadow.mapSize.x, probe: !!ren.probe, infoMemory: { geometries: m.geometries, textures: m.textures }, tilesInScene: ren.track.children.length, lod: ren.lodIn?.size, full: ren.track.children.length - (ren.lodIn?.size ?? 0), pixelRatio: ren.r.getPixelRatio().toFixed(2), gtao: !!ren.gtao?.enabled, bloom: !!ren.bloom?.enabled, msaa: ren.composer?.renderTarget1?.samples, drop: window.__w11diag.drop, calls: ren.r.info.render.calls, trisDrawn: ren.r.info.render.triangles }
}
const t0 = Date.now()
await p.goto(base); await p.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
const ready = { t: (Date.now() - t0) / 1000, ...(await p.evaluate(est)) }
await p.evaluate(() => document.getElementById('bootGo').click())
await p.waitForTimeout(32000); await p.screenshot({ path: '/tmp/mem_after.png' })
const after25s = await p.evaluate(est)
const log = await p.evaluate(() => window.__w11diag.log.filter(l => /GPU|tuile|qualité|perdu|erreur|LOD/.test(l)).slice(-14))
console.log(JSON.stringify({ W, H, ready, after25s, errors: errs, log }, null, 1))
await b.close()
