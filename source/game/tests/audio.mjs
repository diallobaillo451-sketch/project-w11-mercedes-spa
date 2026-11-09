// Vérification audio HORS LIGNE (pas une écoute réelle) : télémétrie d'un tour de démo → OfflineAudioContext
// → WAV + analyse du signal (crête, RMS, saturation, clics, silences, DC) + coutures des boucles moteur.
import { chromium } from '@playwright/test'
import fs from 'node:fs'; import { execSync } from 'node:child_process'
const OUT = new URL('../../out/audio/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true })
const ENG = new URL('../public/audio/engine/', import.meta.url).pathname
const T = +(process.argv[2] || 110), DT = 0.02, SR = 44100
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })).newPage()
p.on('pageerror', e => console.log('PAGEERR', e.message))
await p.goto('http://127.0.0.1:5199/?q=low')
await p.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
await p.click('#bootGo'); await p.waitForTimeout(500)
await p.click('[data-act=demo]'); await p.waitForTimeout(500)
const res = await p.evaluate(async ({ T, DT, SR }) => {
  const w = window.__w11, g = w.game, frames = []; let laps = []
  w.audio.suspend()
  for (let t = 0; t < T; t += DT) {
    g.advance(DT); const c = g.car
    let kerb = 0, gravel = 0, slip = 0
    for (const wh of c.wheels) { if (!wh.contact) continue; if (wh.type === 2) kerb += 0.25; if (wh.type >= 4) gravel += 0.25; slip = Math.max(slip, Math.abs(wh.slipVel ?? 0)) }
    if (g.events?.lap) laps.push(+t.toFixed(2))
    frames.push({ rpm: c.rpmVis, throttle: c.throttleApplied ?? 0, speed: c.speed, slip, kerb, gravel, scrape: g.maxScrape, impact: g.maxImpact,
      shift: g.shifts, gear: c.gear, limiter: c.limiter, ers: (c.ers.kPower ?? 0) / 120000, inside: true, pan: 0, dist: 1, radialV: 0 })
  }
  const oc = new OfflineAudioContext(2, Math.ceil(SR * (frames.length * DT + 0.3)), SR)
  const ae = new w.AudioEngine(); await ae.init('./audio/engine/', oc)
  ae.update(frames[0], DT)
  for (let k = 1; k < frames.length; k++) oc.suspend(k * DT).then(() => { ae.update(frames[k], DT); oc.resume() })
  const t0 = performance.now(); const buf = await oc.startRendering(); const ms = performance.now() - t0
  const toB64 = ch => { const f = buf.getChannelData(ch), i16 = new Int16Array(f.length); for (let i = 0; i < f.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)))
    let s = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s) }
  const peakF = ch => { const f = buf.getChannelData(ch); let m = 0, n = 0; for (const x of f) { const a = Math.abs(x); if (a > m) m = a; if (a >= 0.999) n++ } return [m, n] }
  return { L: toB64(0), R: toB64(1), ms, n: frames.length, laps, shifts: frames.map((f, k) => f.shift ? k * DT : -1).filter(x => x >= 0),
    speed: frames.map(f => f.speed), tele: frames.map(f => [+f.kerb.toFixed(2), f.limiter ? 1 : 0, +f.throttle.toFixed(2), f.gear, +f.impact.toFixed(2), +f.gravel.toFixed(2)]), peakFloat: [peakF(0), peakF(1)] }
}, { T, DT, SR })
await b.close()
const L = new Int16Array(Buffer.from(res.L, 'base64').buffer.slice(0)), R = new Int16Array(Buffer.from(res.R, 'base64').buffer.slice(0))
// WAV stéréo 16 bits
const N = L.length, wav = Buffer.alloc(44 + N * 4)
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22)
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) { wav.writeInt16LE(L[i], 44 + i * 4); wav.writeInt16LE(R[i], 46 + i * 4) }
fs.writeFileSync(OUT + 'demo_tour_audio.wav', wav)
const db = x => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1)
const x = new Float32Array(N); for (let i = 0; i < N; i++) x[i] = (L[i] + R[i]) / 65534
let peak = 0, ss = 0, dc = 0; for (const v of x) { peak = Math.max(peak, Math.abs(v)); ss += v * v; dc += v }
// RMS par fenêtres de 100 ms
const W = SR / 10 | 0, rmsW = []; for (let i = 0; i + W <= N; i += W) { let s = 0; for (let j = i; j < i + W; j++) s += x[j] * x[j]; rmsW.push(Math.sqrt(s / W)) }
const sorted = [...rmsW].sort((a, b) => a - b), q = f => sorted[Math.floor(f * (sorted.length - 1))]
// clics : 2e différence anormale vs. son voisinage (5 ms), groupés à 20 ms ; expliqués si ±60 ms d'un passage de rapport
const d2 = new Float32Array(N); for (let i = 2; i < N; i++) d2[i] = Math.abs(x[i] - 2 * x[i - 1] + x[i - 2])
const H = 220, pre = new Float64Array(N + 1); for (let i = 0; i < N; i++) pre[i + 1] = pre[i] + d2[i] * d2[i]
const detect = (d2, pre) => { const out = []
for (let i = H; i < N - H; i++) {
  const loc = Math.sqrt((pre[i + H] - pre[i - H] - d2[i] * d2[i]) / (2 * H - 1))
  if (d2[i] > 0.04 && d2[i] > 5 * loc) { const t = i / SR; if (!out.length || t - out.at(-1).t > 0.02) out.push({ t, d2: d2[i], ratio: d2[i] / loc }) }
} return out }
const clicks = detect(d2, pre)
// auto-test du détecteur : 5 marches de 0,1 injectées dans une copie → doivent être trouvées
const xi = Float32Array.from(x), inj = [11.1, 33.3, 55.5, 77.7, 99.9]; for (const t of inj) { const i0 = Math.round(t * SR); for (let i = i0; i < i0 + 40; i++) xi[i] += 0.1 }
const d2i = new Float32Array(N); for (let i = 2; i < N; i++) d2i[i] = Math.abs(xi[i] - 2 * xi[i - 1] + xi[i - 2])
const prei = new Float64Array(N + 1); for (let i = 0; i < N; i++) prei[i + 1] = prei[i] + d2i[i] * d2i[i]
const found = detect(d2i, prei), selfTest = inj.filter(t => found.some(c => Math.abs(c.t - t) < 0.01)).length
const explained = c => res.shifts.some(s => Math.abs(s - c.t) < 0.06) || c.t < 0.3
const unexpl = clicks.filter(c => !explained(c))
// coutures des boucles WAV moteur (saut dernière→première trame vs. pas typique)
const seams = fs.readdirSync(ENG).filter(f => f.endsWith('.wav')).map(f => {
  const bb = fs.readFileSync(ENG + f), d = new Int16Array(bb.buffer.slice(bb.byteOffset + 44, bb.byteOffset + bb.length)), n = d.length
  let st = 0; const steps = new Float32Array(n - 1); for (let i = 1; i < n; i++) { steps[i - 1] = Math.abs(d[i] - d[i - 1]); st += steps[i - 1] } st /= n - 1
  steps.sort(); const p99 = steps[Math.floor(0.99 * (n - 2))], jump = Math.abs(d[0] - d[n - 1])
  return { f, jump, typ: +st.toFixed(0), p99: +p99.toFixed(0), ratio: +(jump / st).toFixed(2), sous_p99: jump <= p99 }
})
try { execSync(`ffmpeg -y -loglevel error -i ${OUT}demo_tour_audio.wav -lavfi showspectrumpic=s=1200x400:legend=1 ${OUT}demo_tour_audio_spectre.png`) } catch (e) { console.log('spectre KO', e.message) }
const rep = {
  note: 'Analyse du signal rendu hors ligne (OfflineAudioContext Chrome) — ce n\'est PAS une écoute sur iPhone',
  duree_s: +(N / SR).toFixed(1), rendu_ms: Math.round(res.ms), trames_telemetrie: res.n, tours_detectes_s: res.laps, passages_rapport: res.shifts.length,
  crete_dBFS: db(peak), crete_float_LR: res.peakFloat.map(([m]) => +m.toFixed(4)), echantillons_satures_float: res.peakFloat.map(([, n]) => n),
  rms_global_dBFS: db(Math.sqrt(ss / N)), rms100ms_dBFS: { p5: db(q(0.05)), p50: db(q(0.5)), p95: db(q(0.95)), max: db(sorted.at(-1)) },
  fenetres_silence_lt_m50dB: rmsW.filter(r => r < 10 ** (-50 / 20)).length, offset_DC: +(dc / N).toExponential(2),
  autotest_detecteur_clics: `${selfTest}/${inj.length} marches de 0,1 injectées retrouvées`, clics_detectes: clicks.length, clics_expliques_passage_rapport: clicks.length - unexpl.length, clics_inexpliques: unexpl.length,
  clics_inexpliques_premiers: unexpl.slice(0, 12).map(c => ({ t: +c.t.toFixed(3), ratio: +c.ratio.toFixed(1), 'kerb,limiteur,gaz,rapport,choc,gravier': res.tele[Math.round(c.t / DT)] })),
  coutures_boucles_max_ratio: Math.max(...seams.map(s => s.ratio)), coutures_toutes_sous_p99_des_pas: seams.every(s => s.sous_p99), coutures: seams,
}
fs.writeFileSync(OUT + 'audio_report.json', JSON.stringify(rep, null, 1))
console.log(JSON.stringify(rep, null, 1))
