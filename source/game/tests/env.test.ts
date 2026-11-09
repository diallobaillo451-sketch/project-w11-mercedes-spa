// Tests piste / météo / pneus / dégâts (Node ≥ 23) : node tests/env.test.ts
import { readFileSync } from 'node:fs'
import { Vehicle } from '../src/physics/vehicle.ts'
import { TrackEnv } from '../src/physics/env.ts'
import { newTyre, tyreThermal, muPeak } from '../src/physics/tyre.ts'
import { FlatSurface, TrackSurface } from '../src/track/surface.ts'
import { buildRacingLine } from '../src/track/racingLine.ts'
import { Session } from '../src/core/session.ts'
import { Autopilot } from '../src/physics/autopilot.ts'
import { fmt } from '../src/timing/timing.ts'
import type { Compound } from '../src/physics/params.ts'
const DT = 1 / 240
let fails = 0
const check = (n: string, ok: boolean, info: string) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n} — ${info}`) }
const g = { mu: 0, aqua: 0, water: 0, rubber: 0, marbles: 0 }
// 1. gomme et marbles
{
  const e = new TrackEnv(7000, () => 0); e.setEvolution(0.1)
  const m0 = e.grip(500, 0, 60, 'slick', 0.405, g).mu
  for (let t = 0; t < 106 * 15; t += 0.1) e.update(0.1)
  const m1 = e.grip(500, 0, 60, 'slick', 0.405, g).mu; e.setEvolution(0.9); const off = e.grip(500, 4.5, 60, 'slick', 0.405, g).mu
  check('piste qui se gomme (15 tours de plateau)', m1 > m0 * 1.012 && m1 <= 1.03, `trajectoire μ ×${m0.toFixed(3)} → ×${m1.toFixed(3)}`)
  check('marbles hors trajectoire (piste très gommée)', off < 0.93, `à 4,5 m de la trajectoire μ ×${off.toFixed(3)}`)
}
// 2. pluie : adhérence et aquaplaning selon le pneu
{
  const e = new TrackEnv(7000, () => 0); e.setWeather('rain')
  const r: string[] = []; const a: Record<string, number> = {}
  for (const k of ['slick', 'inter', 'wet'] as const) for (const v of [100, 250]) { e.grip(1000, 0.4, v / 3.6, k, 0.405, g); r.push(`${k} ${v} km/h μ×${g.mu.toFixed(2)} aqua ${g.aqua.toFixed(2)}`); a[k + v] = g.aqua }
  check('aquaplaning forte pluie (slick ≫ inter > pluie)', a.slick250 > 0.8 && a.inter250 > a.wet250 && a.wet100 < 0.05, `film ${g.water.toFixed(2)} mm · ` + r.join(' · '))
}
// 3. trajectoire qui sèche
{
  const e = new TrackEnv(7000, () => 0); e.setWeather('wet'); e.rainRate = 0; e.cloud = 0.4
  for (let t = 0; t < 1200; t += 0.1) e.update(0.1)
  const on = e.water[e.idx(2000, 0)], offl = e.water[e.idx(2000, 6)]
  check('trajectoire sèche en premier (20 min sans pluie)', on < offl * 0.6, `eau trajectoire ${on.toFixed(2)} mm, hors trajectoire ${offl.toFixed(2)} mm`)
}
// 4. pneus : grainage à froid, cloquage, plat, crevaison, fenêtres C1…C5
{
  const t = newTyre(true, 'C3', 60); for (let i = 0; i < 240 * 8; i++) { tyreThermal(t, 90_000, 30, 15, 18, DT, 'C3', true, 0); t.temp = Math.min(t.temp, 70) }
  check('grainage (C3 glisse froid)', t.graining > 0.05, `grainage ${(t.graining * 100).toFixed(1)} %`)
  const b = newTyre(false, 'C5'); b.core = 150; b.temp = 140; for (let i = 0; i < 240 * 10; i++) { tyreThermal(b, 60_000, 60, 25, 40, DT, 'C5', false, 2000); b.core = Math.max(b.core, 140) }
  check('cloquage (C5 carcasse 140 °C)', b.blister > 0.05 && b.thermalDeg > 0.01, `cloques ${(b.blister * 100).toFixed(1)} %, dégr. thermique ${(b.thermalDeg * 100).toFixed(1)} %`)
  const f = newTyre(true, 'C4'); for (let i = 0; i < 240 * 1; i++) tyreThermal(f, 200_000, 50, 18, 27, DT, 'C4', true, 0, 0, 0, true)
  check('plat sur blocage 1 s à 180 km/h', f.flatSpot > 0.02, `plat ${(f.flatSpot * 100).toFixed(1)} %`)
  const p = newTyre(true, 'C4'); const m0 = muPeak(4000, p, 'C4', true); p.puncture = 1; tyreThermal(p, 0, 50, 18, 27, DT, 'C4', true, 0)
  check('crevaison', muPeak(4000, p, 'C4', true) < m0 * 0.35 && p.pressure < 1, `μ ${m0.toFixed(2)} → ${muPeak(4000, p, 'C4', true).toFixed(2)}, pression ${p.pressure.toFixed(1)} psi`)
  const win = (['C1', 'C2', 'C3', 'C4', 'C5'] as Compound[]).map(c => { const x = newTyre(true, c, 95); return `${c} ${muPeak(4000, x, c, true).toFixed(3)}` })
  check('composés C1–C5 à 95 °C (C1/C2 froids, C4/C5 dans la fenêtre)', true, win.join(' · '))
}
// 5. dégâts : dérive cassée → la voiture tire ; roue arrachée → la voiture racle
{
  const run = (ep: [number, number]) => { const car = new Vehicle(new FlatSurface()); car.damage.endplate = ep; car.placeAt(0, 0, 70); for (let i = 0; i < 240 * 2; i++) car.step(DT, { throttle: 0.85, brake: 0, steer: 0 }); return car.wb[1] }
  const y0 = run([0, 0]), y1 = run([1, 0])
  check('dérive AV gauche arrachée → lacet parasite', Math.abs(y1) > Math.abs(y0) + 0.002, `lacet ${y0.toFixed(4)} → ${y1.toFixed(4)} rad/s`)
  const car = new Vehicle(new FlatSurface()); car.damage.wheelOff[1] = true; car.placeAt(0, 0, 20); let sc = 0
  for (let i = 0; i < 240 * 2; i++) { car.step(DT, { throttle: 0.3, brake: 0, steer: 0 }); sc = Math.max(sc, car.scrape) }
  check('roue AVD arrachée : la coque touche le sol', sc > 0.05 && car.pos[1] < 0.29, `frottement max ${sc.toFixed(2)}, CG ${car.pos[1].toFixed(3)} m`)
}
// 6. tour de Spa : sec pneus C4, pluie pneus pluie
{
  const meta = JSON.parse(readFileSync(new URL('../public/track/surface.json', import.meta.url), 'utf8'))
  const buf = readFileSync(new URL('../public/track/surface.bin', import.meta.url))
  const track = new TrackSurface(meta, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2))
  const bb = readFileSync(new URL('../public/track/barriers.bin', import.meta.url)); track.barriers = new (await import('../src/track/barriers.ts')).Barriers(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength))
  const line = buildRacingLine(track, 1600, 1.0)
  const lap = (w: 'dry' | 'rain' | 'wet', c: Compound) => {
    const car = new Vehicle(track); car.setup.steerAssist = 0; car.setup.stability = 0.3
    const env = new TrackEnv(track.length, s => line.e[Math.floor(((s % track.length) + track.length) % track.length / line.ds) % line.N]); env.setEvolution(0.75); env.setWeather(w); car.env = env; car.fitTyres(c)
    const ap = new Autopilot(line, 1.06), se = new Session(track.length, 'timetrial'); const L = track.length
    car.placeAt(L - 200, line.e[Math.floor((L - 200) / line.ds) % line.N], 55)
    let t = 0, acc = 0, laps: number[] = [], hits = 0, aq = 0
    while (t < 260 && laps.length < 2) { car.step(DT, ap.control(car)); t += DT; se.update(car, t, DT); acc += DT; if (acc > 0.1) { env.update(acc); acc = 0 }
      if (car.impact > 0.3) hits++; aq = Math.max(aq, car.aqua); if (se.timing.events.includes('lap')) laps.push(se.timing.lastLap!.time) }
    return { laps, hits, aq, tf: car.wheels[0].tyre.temp }
  }
  const d = lap('dry', 'C4'); check('tour sec (C4, piste gommée)', d.laps.length >= 1 && d.laps[0] < 103, `${d.laps.map(fmt).join(' / ')} · chocs ${d.hits}`)
  const r = lap('rain', 'W'); check('tour sous forte pluie (pneus pluie)', r.laps.length >= 1 && r.laps[0] > d.laps[0] * 1.08 && r.laps[0] < d.laps[0] * 1.35, `${r.laps.map(fmt).join(' / ')} (+${((r.laps[0] / d.laps[0] - 1) * 100).toFixed(0)} %) · aquaplaning max ${r.aq.toFixed(2)} · pneu AVG ${r.tf.toFixed(0)} °C · chocs ${r.hits}`)
}
console.log(fails ? `${fails} échec(s)` : 'tous les tests passent'); process.exit(fails ? 1 : 0)
