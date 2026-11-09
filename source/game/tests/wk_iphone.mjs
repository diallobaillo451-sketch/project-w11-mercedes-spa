// WebKit (moteur de Safari) en émulation iPhone 844×390 @3, tactile, UA iOS 18. Usage : node tests/wk_iphone.mjs URL tag [attente_s]
import { webkit } from '@playwright/test'
const url = process.argv[2], tag = process.argv[3] || 'wk', wait = Number(process.argv[4] || 40)
const b = await webkit.launch()
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const p = await ctx.newPage(), errs = [], cons = []
p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { cons.push(m.type() + ': ' + m.text()); if (m.type() === 'error') errs.push(m.text()) })
p.on('requestfailed', r => errs.push('reqfail ' + r.url() + ' ' + r.failure()?.errorText))
p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()) })
const t0 = Date.now(); await p.goto(url, { timeout: 120000 })
try { await p.waitForSelector('#bootGo:not([hidden])', { timeout: 300000 }) } catch (e) { errs.push('boot timeout') }
const tReady = (Date.now() - t0) / 1000
await p.screenshot({ path: `../out/wk/${tag}_1_pret.png` })
await p.evaluate(() => document.getElementById('bootGo')?.click())
await p.waitForTimeout(3000)
await p.evaluate(() => window.__w11?.startSession?.('demo'))
await p.waitForTimeout(wait * 1000)
await p.screenshot({ path: `../out/wk/${tag}_2_demo.png` })
const d = await p.evaluate(() => { const d = window.__w11diag, r = window.__w11?.ren; if (!r) return { d }
  const gl = r.r.getContext(); const ext = n => !!gl.getExtension(n)
  return { preset: d.preset, safe: d.safe, safeReason: d.safeReason, ktx: d.ktx, texMB: Math.round(d.texBytes / 1048576), canvas: r.canvas.width + '×' + r.canvas.height, pr: r.r.getPixelRatio(), scale: r.scale, fx: r.fxLevel, upgraded: r.upgraded, composer: !!r.composer, shadow: r.sun.shadow.mapSize.x,
    tiles: r.tiles.loaded.size + '/' + r.tiles.total, inScene: r.tilesInScene, pending: r.texturesPending, calls: r.r.info.render.calls, tris: r.r.info.render.triangles, gpu: d.gpu && Math.round(d.gpu.total / 1048576),
    astc: ext('WEBGL_compressed_texture_astc'), etc: ext('WEBGL_compressed_texture_etc'), bptc: ext('EXT_texture_compression_bptc'), s3tc: ext('WEBGL_compressed_texture_s3tc'), lastError: d.lastError, log: d.log } })
console.log(JSON.stringify({ tReady, ...d, errs: errs.slice(0, 30), cons: cons.filter(c => !c.startsWith('log')).slice(0, 20) }, null, 1))
await b.close()
