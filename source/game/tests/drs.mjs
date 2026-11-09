// Vérifie visuellement le volet DRS séparé (tools/split-drs.mjs) : caméra libre derrière la voiture, DRS fermé puis ouvert.
// Usage : node tests/drs.mjs [baseURL] → ../out/app/drs_{q}_{ferme,ouvert}.png + contrôle numérique de rotation du nœud.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const base = process.argv[2] || 'http://127.0.0.1:5199/'
const OUT = new URL('../../out/app/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let fail = 0; const res = {}
for (const q of ['high', 'low']) {
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage()
  const errs = []; p.on('pageerror', e => errs.push(String(e)))
  await p.goto(base + '?q=' + q + '&yaw=' + (process.env.YAW ?? 2.2)); await p.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
  await p.click('#bootGo'); await p.waitForTimeout(500); await p.click('[data-act=timetrial]'); await p.waitForTimeout(800)
  const info = await p.evaluate(() => { const w = window.__w11; w.game.paused = true; w.setCam('free'); const c = w.ren.cams; c.orbitYaw = +(new URLSearchParams(location.search).get('yaw') ?? 0.6); c.orbitPitch = 0.42; c.orbitDist = 3.5
    const d = w.ren.rig.drs; let tris = 0; d?.traverse(o => { if (o.isMesh) tris += o.geometry.index.count / 3 }); return { found: !!d, tris } })
  for (const [tag, v] of [['ferme', 0], ['ouvert', 1]]) {
    await p.evaluate(v => { window.__w11.game.car.drsPos = v }, v); await p.waitForTimeout(1500)
    const rx = await p.evaluate(() => window.__w11.ren.rig.drs?.rotation.x ?? null)
    await p.screenshot({ path: `${OUT}drs_${q}_${tag}.png` }); info[tag] = rx
  }
  await p.context().close()
  info.ok = info.found && info.tris > 300 && Math.abs(info.ferme) < 1e-6 && Math.abs(info.ouvert - 25 * Math.PI / 180) < 1e-3 && !errs.length
  info.errs = errs; res[q] = info; if (!info.ok) fail++; console.log(q, JSON.stringify(info))
}
fs.writeFileSync(OUT + 'drs_report.json', JSON.stringify(res, null, 1)); await b.close(); process.exit(fail ? 1 : 0)
