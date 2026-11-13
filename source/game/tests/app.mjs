// Tests Playwright de l'application en viewport iPhone PAYSAGE (rendu logiciel SwiftShader : lent, pas représentatif des i/s iPhone).
// Usage : node tests/app.mjs [baseURL]   (serveur vite déjà lancé)  → captures dans ../out/app/, rapport JSON.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const base = process.argv[2] || 'http://127.0.0.1:5199/'
const OUT = new URL('../../out/app/', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const VIEWS = [{ name: 'iphone13_844x390', w: 844, h: 390 }, { name: 'iphone15promax_932x430', w: 932, h: 430 }]
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const report = { date: new Date().toISOString(), base, views: {} }
let fail = 0
const check = (r, name, ok, info = '') => { r.checks.push({ name, ok, info }); if (!ok) { fail++; console.log('ÉCHEC', name, info) } else console.log('ok', name, info) }
for (const V of VIEWS) {
  const r = { checks: [], errors: [], warnings: [], shots: [] }; report.views[V.name] = r
  const ctx = await b.newContext({ viewport: { width: V.w, height: V.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  const p = await ctx.newPage()
  p.on('pageerror', e => r.errors.push('pageerror: ' + e))
  p.on('console', m => { if (m.type() === 'error') r.errors.push('console: ' + m.text()) })
  p.on('requestfailed', q => {
    const reason = q.failure()?.errorText ?? 'échec réseau', message = 'requestfailed: ' + q.url() + ' · ' + reason
    if (reason === 'net::ERR_ABORTED') r.warnings.push(message) // navigation de séance : le navigateur annule des imports devenus obsolètes
    else r.errors.push(message)
  })
  const shot = async (n) => { const f = `${OUT}${V.name}_${n}.png`; await p.screenshot({ path: f }); r.shots.push(f) }
  const t0 = Date.now()
  await p.goto(base + '?q=medium')
  await p.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
  check(r, 'chargement', true, ((Date.now() - t0) / 1000).toFixed(1) + ' s')
  await shot('01_boot')
  // piste pleine qualité en tuiles : toutes chargées (streaming), textures partagées (77 sources uniques)
  await p.waitForFunction(() => window.__w11 && (window.__w11.ren.mobile ? window.__w11.ren.tilesInScene >= 3 : window.__w11.ren.tiles.loaded.size === window.__w11.ren.tiles.total), null, { timeout: 300000, polling: 500 }).catch(() => {})
  const tl = await p.evaluate(() => { const r = window.__w11?.ren; if (!r) return null; const S = new Set(); r.track.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) for (const k in m) if (m[k]?.isTexture) S.add(m[k].source) })
    return { mobile: r.mobile, inScene: r.tilesInScene, start: r.tilesAtStart, n: r.tiles.loaded.size, total: r.tiles.total, src: S.size } })
  check(r, tl?.mobile ? 'piste pleine qualité (mobile : streaming des tuiles proches)' : 'piste pleine qualité : 13 tuiles chargées, textures uniques', !!tl && tl.total === 13 && (tl.mobile ? tl.inScene >= 3 && tl.src > 0 : tl.n === tl.total && tl.src === 77), JSON.stringify(tl))
  await p.click('#bootGo'); await p.waitForTimeout(700)
  check(r, 'menu visible', await p.isVisible('#menu'))
  await shot('02_menu')
  await p.click('[data-act=setup]'); await p.waitForTimeout(300); await shot('03_reglages'); await p.click('#panelClose')
  await p.click('[data-act=options]'); await p.waitForTimeout(300); await shot('04_options')
  // panneau Diagnostic (Options → Diagnostic → Ouvrir)
  await p.locator('#panelBody .f', { hasText: 'Diagnostic' }).locator('button').click(); await p.waitForTimeout(1200); await shot('04b_diagnostic')
  const dg = await p.evaluate(() => { const d = window.__w11diag; return { ktx: d.ktx, safe: d.safe, preset: d.preset, bootMs: d.bootMs, texMB: Math.round(d.texBytes / 1048576), err: d.lastError, rows: document.querySelectorAll('#dT tr').length } })
  check(r, 'diagnostic : panneau + KTX2 mobile + aucune erreur', dg.rows >= 8 && dg.ktx && !dg.err, JSON.stringify(dg)); r.diag = dg
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
  const tp = await p.evaluate(() => 1)
  void tp
  await p.mouse.up()
  const cdp = await ctx.newCDPSession(p)
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  const sx = sz.x + sz.width / 2, sy = sz.y + sz.height / 2, tx = thr.x + thr.width / 2, ty = thr.y + 12
  await touch('touchStart', [{ x: tx, y: ty, id: 1 }])
  await touch('touchStart', [{ x: tx, y: ty, id: 1 }, { x: sx, y: sy, id: 2 }])
  await touch('touchMove', [{ x: tx, y: ty, id: 1 }, { x: sx + 120, y: sy, id: 2 }])
  await p.waitForTimeout(1500)
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
  // SwiftShader can take several seconds to render its next frame; wait for the loop to consume the held analog input.
  await p.waitForFunction(() => window.__w11.input.st.brake > 0.4 && window.__w11.input.st.brake < 0.8 && window.__w11.game.ctl.brake > 0.4, null, { timeout: 15000 }).catch(() => {})
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
  const lap = await p.evaluate(() => { const t = window.__w11.game.session.timing; return { time: t.lastLap.time, sectors: t.lastLap.sectors, valid: t.lastLap.valid } })
  check(r, 'tour de démo chronométré (3 secteurs)', lap.sectors.length === 3 && lap.time > 95 && lap.time < 115, `${lap.time.toFixed(3)} s · S ${lap.sectors.map(x => x.toFixed(2)).join(' / ')}`)
  await p.evaluate(() => { window.__w11.fixedDt = 1 / 30 }); await p.waitForTimeout(800)
  await shot('10_demo_tv')
  const verifyFieldMode = async (label, expected, start) => {
    await p.evaluate(start)
    await p.waitForFunction(() => {
      const W = window.__w11, F = W?.game?.field, V = W?.fview
      return !!F && !!V?.ready && V.views.length === 19 && V.views.every(v => F.cars.includes(v.r)) && V.views.some(v => v.obj.visible)
    }, null, { timeout: 90000 }).catch(() => {})
    const state = await p.evaluate(() => {
      const W = window.__w11, F = W?.game?.field, V = W?.fview
      return { kind: F?.kind, total: F?.cars.filter(x => !x.player).length ?? 0, views: V?.views.length ?? 0, root: !!V?.root.visible,
        visible: V?.views.filter(v => v.obj.visible).length ?? 0, near: F?.near.size ?? 0,
        bound: !!F && !!V && V.views.length === 19 && V.views.every(v => F.cars.includes(v.r)) }
    })
    check(r, `${label} : 19 IA chargées et visibles, physique plafonnée à 4`, state.kind === expected && state.total === 19 && state.views === 19 && state.root && state.visible > 0 && state.near <= 4 && state.bound, JSON.stringify(state))
  }
  await verifyFieldMode('Essais libres', 'practice', () => {
    const W = window.__w11
    W.startSession('practice')
    for (const c of W.game.field.cars) if (!c.player) { c.runs[0] = 0; c.runIdx = 0 }
  })
  await verifyFieldMode('Qualifications', 'qualifying', () => {
    const W = window.__w11
    W.startSession('qualifying')
    for (const c of W.game.field.cars) if (!c.player) { c.runs[0] = 0; c.runIdx = 0 }
  })
  await verifyFieldMode('Course autonome', 'race', () => window.__w11.startSession('race'))
  // This test intentionally uses software SwiftShader. Unsupported KTX2 transcodes cascade into GLTFLoader texture errors,
  // but the game falls back to WebP; retain them as warnings while still failing on JS errors or network failures.
  const ktxFailed = r.errors.some(e => e.includes('THREE.KTX2Loader: .transcodeImage failed'))
  if (ktxFailed) { const fallback = r.errors.filter(e => e.startsWith('console: ') && /THREE\.(?:GLTFLoader: Couldn't load texture|KTX2Loader: \.transcodeImage failed)/.test(e)); r.warnings.push(...fallback); r.errors = r.errors.filter(e => !fallback.includes(e)) }
  const warningInfo = r.warnings.length ? `${r.warnings.length} avertissement(s) non bloquant(s) : ${r.warnings.slice(0, 2).join(' | ')}` : ''
  check(r, 'aucune erreur JavaScript/réseau non récupérée', r.errors.length === 0, r.errors.slice(0, 3).join(' | ') || warningInfo)
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
