// Démarrage « iPhone » (UA iOS, tactile) en préréglage par défaut (Haute), réseau lent simulé (CDP), puis mode sans échec
// après « plantage » simulé (drapeau w11.alive resté à 1). Usage : node tests/boot_mobile.mjs [baseURL] [Mbit/s]
import { chromium } from '@playwright/test'
const base = process.argv[2] || 'http://127.0.0.1:5199/', mbps = Number(process.argv[3] || 20)
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const out = {}
for (const [w, h] of [[844, 390], [932, 430]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  const p = await ctx.newPage(), errs = []
  p.on('pageerror', e => errs.push('pageerror: ' + e)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: mbps * 125000, uploadThroughput: 2e5 })
  const t0 = Date.now(); await p.goto(base)
  await p.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
  const tReady = (Date.now() - t0) / 1000
  await p.waitForFunction(() => window.__w11 && window.__w11.ren.texturesPending === 0, null, { timeout: 240000, polling: 500 }); const tTex = (Date.now() - t0) / 1000; await p.waitForTimeout(1500); await p.screenshot({ path: `../out/app/boot_${w}x${h}_textures.png` })
  const tMenu = await p.evaluate(() => { const t = performance.now(); document.getElementById('bootGo').click(); return { ms: +(performance.now() - t).toFixed(1), menuVisible: !document.getElementById('menu').hidden } })
  const d = await p.evaluate(() => { const d = window.__w11diag, r = window.__w11.ren; return { preset: d.preset, safe: d.safe, ktx: d.ktx, texMB: Math.round(d.texBytes / 1048576), canvas: r.canvas.width + '×' + r.canvas.height, tiles: r.tiles.loaded.size, err: d.lastError } })
  const heap = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)
  out[`${w}x${h}`] = { tReady, tTexturesComplete: tTex, tMenuMs: tMenu, heapMB: heap, ...d, errors: errs.slice() }
  await ctx.close()
}
{ // plantage simulé (onglet tué alors que visible → drapeau w11.alive resté à 1) → mode sans échec au chargement suivant
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' })
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('w11.alive', '1') } })
  const p = await ctx.newPage(); await p.goto(base)
  await p.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
  out.crashSim = await p.evaluate(() => ({ safe: window.__w11diag.safe, reason: window.__w11diag.safeReason, preset: window.__w11diag.preset, text: document.getElementById('bootText').textContent }))
  await ctx.close()
}
console.log(JSON.stringify({ mbps, out }, null, 1))
await b.close()
