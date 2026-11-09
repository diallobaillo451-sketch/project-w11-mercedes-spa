// Bas régime : rendu hors ligne ralenti → montée → descente ; RMS par fenêtre de 50 ms (trous = « plante »)
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const url = process.argv[2] || 'http://127.0.0.1:4199/'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage()
await p.goto(url + '?q=low'); await p.waitForFunction(() => window.__w11, null, { timeout: 240000 })
const r = await p.evaluate(async () => {
  const SR = 44100, DT = 0.02, T = 12, oc = new OfflineAudioContext(2, SR * (T + 0.3), SR)
  const ae = new window.__w11.AudioEngine(); await ae.init('./audio/engine/', oc)
  const fr = t => { let rpm, thr
    if (t < 3) { rpm = 4000 + 60 * Math.sin(t * 7); thr = 0 } else if (t < 6) { rpm = 4000 + (t - 3) / 3 * 5000; thr = 0.35 } else if (t < 9) { rpm = 9000 - (t - 6) / 3 * 4800; thr = 0 } else { rpm = 4300 + (t - 9) * 300; thr = (t % 1) < 0.5 ? 0.6 : 0.05 }
    return { rpm, throttle: thr, speed: rpm / 400, slip: 0, kerb: 0, gravel: 0, scrape: 0, impact: 0, shift: 0, gear: 1, limiter: false, ers: 0, inside: false, pan: 0, dist: 8, radialV: 0, cam: 'chase' } }
  ae.update(fr(0), DT); const n = T / DT
  for (let k = 1; k < n; k++) oc.suspend(k * DT).then(() => { ae.update(fr(k * DT), DT); oc.resume() })
  const buf = await oc.startRendering(), L = buf.getChannelData(0), W = SR * 0.05, out = []
  for (let i = 0; i + W < L.length; i += W) { let s = 0; for (let j = 0; j < W; j++) s += L[i + j] ** 2; out.push(20 * Math.log10(Math.sqrt(s / W) + 1e-9)) }
  return out })
await b.close()
const seg = (a, z) => r.slice(a / 0.05, z / 0.05), st = a => ({ min: Math.min(...a).toFixed(1), max: Math.max(...a).toFixed(1), mean: (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) })
const rep = { ralenti: st(seg(0.3, 3)), montee: st(seg(3, 6)), descente: st(seg(6, 9)), petitsCoupsDeGaz: st(seg(9, 12)) }
let maxJump = 0; for (let i = 8; i < r.length - 6; i++) maxJump = Math.max(maxJump, Math.abs(r[i] - r[i - 1]))
rep.sautMaxEntreFenetres_dB = maxJump.toFixed(1)
console.log(JSON.stringify(rep)); fs.writeFileSync('/workspace/w11/out/audio/bas_regime.json', JSON.stringify({ rep, rms: r.map(x => +x.toFixed(1)) }))
