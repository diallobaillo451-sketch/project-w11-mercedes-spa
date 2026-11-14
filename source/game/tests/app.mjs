// Tests Playwright de l'application en viewport iPhone PAYSAGE (rendu logiciel SwiftShader : lent, pas représentatif des i/s iPhone).
// Usage : CIRCUIT=barcelona node tests/app.mjs [baseURL]   (serveur vite déjà lancé) → captures dans ../out/app/, rapport JSON.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const base = process.argv[2] || 'http://127.0.0.1:5199/'
const circuit = process.env.CIRCUIT || 'spa'
const expectedTiles = circuit === 'sepang' ? 1 : 13
const mobileTilesMin = circuit === 'sepang' ? 1 : 3
const OUT = new URL('../../out/app/', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const VIEWS = [{ name: 'iphone13_844x390', w: 844, h: 390 }, { name: 'iphone15promax_932x430', w: 932, h: 430 }]
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const report = { date: new Date().toISOString(), base, circuit, views: {} }
let fail = 0
const check = (r, name, ok, info = '') => { r.checks.push({ name, ok, info }); if (!ok) { fail++; console.log('ÉCHEC', name, info) } else console.log('ok', name, info) }
for (const V of VIEWS) {
  const r = { checks: [], errors: [], shots: [] }; report.views[V.name] = r
  const ctx = await b.newContext({ viewport: { width: V.w, height: V.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  const p = await ctx.newPage()
  p.on('pageerror', e => r.errors.push('pageerror: ' + e))
  p.on('console', m => { if (m.type() === 'error') r.errors.push('console: ' + m.text()) })
  const carRequests = []; p.on('request', q => { if (q.url().includes('w11_lh2020_high')) carRequests.push(q.url()) })
  const shot = async (n) => { const f = `${OUT}${V.name}_${n}.png`; await p.screenshot({ path: f }); r.shots.push(f) }
  const t0 = Date.now()
  await p.goto(base + '?q=medium&circuit=' + encodeURIComponent(circuit))
  await p.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
  check(r, 'chargement', true, ((Date.now() - t0) / 1000).toFixed(1) + ' s')
  const surface = await p.evaluate(async id => {
    const dir = ({ spa: './track/', monza: './track_monza/', barcelona: './track_barcelona/', sepang: './track_sepang/' })[id] || './track/'
    const [mr, br] = await Promise.all([fetch(dir + 'surface.json'), fetch(dir + 'surface.bin')])
    if (!mr.ok || !br.ok) return { ok: false, metaStatus: mr.status, binStatus: br.status }
    const meta = await mr.json(), bytes = await br.arrayBuffer()
    return { ok: bytes.byteLength === meta.N * meta.ND * 2, N: meta.N, ND: meta.ND, length: meta.length, bytes: bytes.byteLength }
  }, circuit)
  check(r, 'grille physique servie et dimensions cohérentes', surface.ok && (circuit !== 'barcelona' || surface.N === 4669) && (circuit !== 'sepang' || surface.N === 5542), JSON.stringify(surface))
  await shot('01_boot')
  // piste pleine qualité en tuiles : toutes chargées (streaming), textures partagées
  await p.waitForFunction(minTiles => window.__w11 && (window.__w11.ren.mobile ? window.__w11.ren.tilesInScene >= minTiles : window.__w11.ren.tiles.loaded.size === window.__w11.ren.tiles.total), mobileTilesMin, { timeout: 300000, polling: 500 }).catch(() => {})
  const tl = await p.evaluate(() => { const r = window.__w11?.ren; if (!r) return null; const S = new Set(); r.track.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) for (const k in m) if (m[k]?.isTexture) S.add(m[k].source) })
    return { mobile: r.mobile, inScene: r.tilesInScene, start: r.tilesAtStart, n: r.tiles.loaded.size, total: r.tiles.total, src: S.size } })
  const texturesOk = circuit === 'spa' ? tl?.src === 77 : (tl?.src ?? 0) > 0
  check(r, tl?.mobile ? 'piste pleine qualité (mobile : streaming des tuiles proches)' : `piste pleine qualité : ${expectedTiles} tuile(s), textures uniques`, !!tl && tl.total === expectedTiles && (tl.mobile ? tl.inScene >= mobileTilesMin && tl.src > 0 : tl.n === tl.total && texturesOk), JSON.stringify(tl))
  if (circuit === 'sepang') {
    // FieldView charge aussi le WebP du showroom Mercedes ; contrôler le repli réel du renderer et l'estimation GPU.
    const carKtx = carRequests.some(u => /w11_lh2020_high_ktx2\.glb/.test(u))
    const carKtxState = await p.evaluate(() => { const d = window.__w11diag; return { ktx: d.ktx, fallback: d.log.some(x => x.includes('voiture KTX2 → repli WebP')), gpu: d.gpu?.total ?? 0 } })
    check(r, 'Sepang garde la W11 KTX2 sans pic mémoire', carKtx && carKtxState.ktx && !carKtxState.fallback && carKtxState.gpu < 250 * 1048576, `KTX2=${carKtx}, repli renderer=${carKtxState.fallback}, GPU≈${(carKtxState.gpu / 1048576).toFixed(0)} MiB`)
  }
  await p.click('#bootGo'); await p.waitForTimeout(700)
  check(r, 'menu visible', await p.isVisible('#menu'))
  await shot('02_menu')
  await p.click('[data-act=setup]'); await p.waitForTimeout(300); await shot('03_reglages'); await p.click('#panelClose')
  await p.click('[data-act=options]'); await p.waitForTimeout(300); await shot('04_options')
  // panneau Diagnostic (Options → Diagnostic → Ouvrir)
  await p.locator('#panelBody .f', { hasText: 'Diagnostic' }).locator('button').click(); await p.waitForTimeout(1200); await shot('04b_diagnostic')
  const dg = await p.evaluate(() => { const d = window.__w11diag; return { ktx: d.ktx, safe: d.safe, preset: d.preset, bootMs: d.bootMs, texMB: Math.round(d.texBytes / 1048576), err: d.lastError, rows: document.querySelectorAll('#dT tr').length } })
  check(r, `diagnostic : panneau + textures (${dg.ktx ? 'KTX2' : 'repli WebP'}) + aucune erreur`, dg.rows >= 8 && !dg.err && (tl?.src ?? 0) > 0, JSON.stringify(dg)); r.diag = dg
  await p.click('#panelClose')
  await p.click('[data-act=about]'); await p.waitForTimeout(300); await shot('05_apropos'); await p.click('#panelClose')
  // --- contre-la-montre piloté au doigt : pédale d'accélérateur tenue
  await p.click('[data-act=timetrial]')
  await p.evaluate(() => { window.__w11.fixedDt = 1 / 30 })
  const thr = await p.locator('#pThrottle').boundingBox()
  await p.mouse.move(thr.x + thr.width / 2, thr.y + 12); await p.mouse.down()
  await p.waitForTimeout(2500)
  const st1 = await p.evaluate(() => { const g = window.__w11.game; return { thr: g.ctl.throttle, v: g.car.speed * 3.6, s: g.car.s, lapStart: g.session.timing.lapStart } })
  check(r, 'pédale tactile → gaz', st1.thr > 0.9, 'gaz ' + st1.thr.toFixed(2))
  await shot('06_conduite_poursuite')
  // direction tactile : glisser dans la zone gauche
  const sz = await p.locator('#steerZone').boundingBox()
  await p.mouse.up()
  const cdp = await ctx.newCDPSession(p)
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  const sx = sz.x + sz.width / 2, sy = sz.y + sz.height / 2, tx = thr.x + thr.width / 2, ty = thr.y + 12
  await touch('touchStart', [{ x: tx, y: ty, id: 1 }, { x: sx, y: sy, id: 2 }])
  await touch('touchMove', [{ x: tx, y: ty, id: 1 }, { x: sx + 120, y: sy, id: 2 }])
  await p.waitForFunction(() => window.__w11.game.ctl.throttle > 0.9 && window.__w11.game.ctl.steer > 0.3, null, { timeout: 20000, polling: 100 }).catch(() => {})
  const st2 = await p.evaluate(() => { const g = window.__w11.game; return { thr: g.ctl.throttle, steer: g.ctl.steer } })
  check(r, 'multi-touch : gaz + direction', st2.thr > 0.9 && st2.steer > 0.3, `gaz ${st2.thr.toFixed(2)} dir ${st2.steer.toFixed(2)}`)
  await shot('07_multitouch_direction')
  await touch('touchEnd', [])
  // freinage
  await p.waitForTimeout(400)
  const br = await p.locator('#pBrake').boundingBox()
  const bx = br.x + br.width / 2, by = br.y + br.height * 0.5
  const hit = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); window.__brkEv = []; document.getElementById('pBrake').addEventListener('pointerdown', ev => window.__brkEv.push(ev.pointerId)); return e ? e.id || e.className : 'none' }, [bx, by])
  await touch('touchStart', [{ x: bx, y: by, id: 3 }])
  await p.waitForFunction(() => window.__w11.input.st.brake > 0.4, null, { timeout: 20000, polling: 100 }).catch(() => {})
  const st3 = await p.evaluate(() => ({ ctl: window.__w11.game.ctl.brake, st: window.__w11.input.st.brake, ev: window.__brkEv.length }))
  check(r, 'pédale de frein analogique (mi-hauteur ≈ 0,5–0,7)', st3.st > 0.4 && st3.st < 0.8, `frein ${st3.st.toFixed(2)} (ctl ${st3.ctl.toFixed(2)}, cible ${hit}, pointerdown ${st3.ev})`)
  await touch('touchEnd', [])
  // caméras
  for (const c of ['close', 'tcam', 'cockpit', 'tv', 'free', 'chase']) { await p.evaluate(c => window.__w11.setCam(c), c); await p.waitForTimeout(900); if (c !== 'chase') await shot('08_cam_' + c) }
  // pause
  await p.click('#bPause'); await p.waitForTimeout(300)
  check(r, 'pause', await p.isVisible('#pause')); await shot('09_pause')
  await p.click('[data-act=resume]')
  // tour de démo complet en pilote automatique : chrono par portes
  // simulation accélérée hors rendu (même code physique, pas fixe 500 Hz) jusqu'à un tour complet
  await p.evaluate(() => { const w = window.__w11; w.startSession('demo'); w.fixedDt = 0 })
  for (let k = 0; k < 60; k++) {
    const done = await p.evaluate(() => { const g = window.__w11.game; for (let i = 0; i < 1500; i++) { g.advance(0.024); if (g.session.timing.laps.length >= 1) return true } return false })
    if (done) break
  }
  const lap = await p.evaluate(() => { const g = window.__w11.game, t = g.session.timing; return t.lastLap ? { time: t.lastLap.time, sectors: t.lastLap.sectors, valid: t.lastLap.valid } : { time: null, sectors: [], valid: false, carS: g.car.s, speed: g.car.speed } })
  const lapMin = circuit === 'barcelona' ? 60 : 95, lapMax = circuit === 'barcelona' ? 130 : 115
  const lapInfo = lap.time === null ? `aucun tour fermé · s=${lap.carS.toFixed(1)} m · v=${(lap.speed * 3.6).toFixed(1)} km/h` : `${lap.time.toFixed(3)} s · S ${lap.sectors.map(x => x.toFixed(2)).join(' / ')}`
  const lapTimeOk = circuit === 'sepang' ? lap.time !== null && Number.isFinite(lap.time) && lap.time > 0 : lap.time !== null && lap.time > lapMin && lap.time < lapMax
  check(r, 'tour de démo chronométré (3 secteurs)', lap.sectors.length === 3 && lapTimeOk && (circuit !== 'sepang' || lap.valid), lapInfo)
  await p.evaluate(() => { window.__w11.fixedDt = 1 / 30 }); await p.waitForTimeout(800)
  await shot('10_demo_tv')
  check(r, 'aucune erreur console', r.errors.length === 0, r.errors.slice(0, 3).join(' | '))
  await ctx.close()
}
// portrait : écran « tourne ton iPhone »
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const p = await ctx.newPage(); await p.goto(base + '?q=low'); await p.waitForTimeout(1500)
  const vis = await p.isVisible('#rotate'); report.portrait = vis
  await p.screenshot({ path: OUT + 'portrait_rotate.png' }); console.log(vis ? 'ok' : 'ÉCHEC', 'portrait → message de rotation'); if (!vis) fail++
  await ctx.close()
}
fs.writeFileSync(OUT + 'playwright_report.json', JSON.stringify(report, null, 2))
await b.close()
console.log(fail ? `${fail} échec(s)` : 'TOUS LES TESTS OK')
process.exit(fail ? 1 : 0)
