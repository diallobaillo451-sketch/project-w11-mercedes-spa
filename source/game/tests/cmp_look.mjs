// capture comparative même point de vue : node tests/cmp_look.mjs URL nom [ios] [attente_s]
import { chromium } from '@playwright/test'
const [url, name, ios, wait = '35'] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext(ios === 'ios' ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' } : { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(url); await p.waitForFunction(() => window.__w11 && !document.getElementById('bootGo')?.hidden, null, { timeout: 240000 })
await p.click('#bootGo'); await p.waitForTimeout(+wait * 1000)
const st = await p.evaluate(() => { const w = window.__w11, r = w.ren; const out = { q: r.q?.name, dpr: r.r.getPixelRatio(), shadow: r.sun?.shadow?.mapSize?.x, tiles: r.track?.children.length, lod: r.lodIn?.size, fx: r.fxLevel, gtao: r.gtao?.enabled, bloom: r.bloom?.enabled, probe: !!r.probe, diag: window.__w11diag?.preset, drop: window.__w11diag?.drop }
  const sizes = {}; let grey = 0, n = 0
  r.scene.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap']) { const t = m[k]; if (!t) continue; n++; const im = t.image || t.source?.data; const w = im?.width ?? t.mipmaps?.[0]?.width ?? 0; if (w <= 4) grey++; sizes[k + ':' + w] = (sizes[k + ':' + w] || 0) + 1 } })
  out.texSlots = n; out.tinyTex = grey; out.sizes = sizes; return out })
await p.evaluate(() => { for (const id of ['hud', 'menu', 'screens', 'panel']) { const e = document.getElementById(id); if (e) e.style.display = 'none' } document.querySelectorAll('.screen,.panel,.overlay').forEach(e => e.style.display = 'none'); window.__w11.setCam('chase') })
await p.waitForTimeout(3000)
await p.screenshot({ path: `/workspace/w11/out/cmp/${name}.png` })
console.log(JSON.stringify({ name, st, errs: errs.slice(0, 5) }))
await b.close()
