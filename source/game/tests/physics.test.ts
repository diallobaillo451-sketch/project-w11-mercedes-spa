// Tests physiques (Node ≥ 23, TypeScript natif) : node tests/physics.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { Vehicle } from '../src/physics/vehicle.ts'
import { FlatSurface, TrackSurface } from '../src/track/surface.ts'
import { buildRacingLine } from '../src/track/racingLine.ts'
import { Session } from '../src/core/session.ts'
import { Autopilot } from '../src/physics/autopilot.ts'
import { Timing, fmt } from '../src/timing/timing.ts'
import { GEAR_RATIOS, icePower } from '../src/physics/powertrain.ts'

const DT = 1 / 240
const results: { name: string; ok: boolean; info: string }[] = []
const check = (name: string, ok: boolean, info: string) => { results.push({ name, ok, info }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${info}`) }
const kmh = (v: number) => v * 3.6

// 1. repos : la voiture se pose, ne flotte pas, ne glisse pas
{
  const car = new Vehicle(new FlatSurface()); car.placeAt(0); car.setup.autoGear = true
  for (let i = 0; i < 240 * 3; i++) car.step(DT, { throttle: 0, brake: 0.3, steer: 0 })
  const sp = Math.hypot(...car.vel), cs = car.wheels.map(w => w.c * 1000)
  check('repos stable', sp < 0.02 && car.wheels.every(w => w.contact) && cs.every(c => Math.abs(c) < 4), `v=${sp.toFixed(4)} m/s, compressions mm=${cs.map(c => c.toFixed(1)).join('/')}, y=${car.pos[1].toFixed(4)}`)
}
// 1b. pente 18 % (Raidillon) frein serré : ne recule pas
{
  const s = new FlatSurface(); const ang = Math.atan(0.18)
  s.sample = (x, z, _h, o) => { o.h = -z * 0.18; const n = Math.hypot(0.18, 1); o.nx = 0; o.ny = 1 / n; o.nz = 0.18 / n; o.type = 1; o.s = -z; o.d = x; o.i = 0; return o }
  const car = new Vehicle(s); car.setup.autoGear = false; car.placeAt(0)
  for (let i = 0; i < 240 * 3; i++) car.step(DT, { throttle: 0, brake: 1, steer: 0 })
  const sp = Math.hypot(...car.vel)
  check('arrêt en pente 18 %', sp < 0.05, `v=${sp.toFixed(4)} m/s (${(ang * 57.3).toFixed(1)}°)`)
}
// 2. accélération / vitesse de pointe
function accelRun(drs: boolean) {
  const car = new Vehicle(new FlatSurface()); car.placeAt(0)
  car.drsAvailable = drs
  let t = 0, t100 = 0, t200 = 0, t300 = 0, d = 0
  for (let i = 0; i < 240 * 40; i++) {
    car.step(DT, { throttle: 1, brake: 0, steer: 0, drs }); t += DT; d += car.speed * DT
    const v = kmh(car.forwardSpeed())
    if (!t100 && v >= 100) t100 = t; if (!t200 && v >= 200) t200 = t; if (!t300 && v >= 300) t300 = t
  }
  return { car, t100, t200, t300, vmax: kmh(car.forwardSpeed()), d }
}
{
  const a = accelRun(false), b = accelRun(true)
  check('0-100 km/h', a.t100 > 2.0 && a.t100 < 3.2, `${a.t100.toFixed(2)} s (réf. publique F1 2020 ≈ 2,6 s, E)`)
  check('0-200 km/h', a.t200 > 4.0 && a.t200 < 5.8, `${a.t200.toFixed(2)} s (réf. ≈ 4,5–5 s, E)`)
  check('vitesse terminale (sans DRS, batterie pleine puis vide)', a.vmax > 315 && a.vmax < 345, `${a.vmax.toFixed(1)} km/h après 40 s, rpm ${a.car.rpm.toFixed(0)} rapport ${a.car.gear}, 0-300 ${a.t300.toFixed(2)} s`)
  check('vitesse terminale DRS', b.vmax > a.vmax + 6, `${b.vmax.toFixed(1)} km/h (+${(b.vmax - a.vmax).toFixed(1)})`)
}
// 3. freinage 300 → 80 km/h
{
  const car = new Vehicle(new FlatSurface()); car.placeAt(0, 0, 300 / 3.6)
  let d = 0, t = 0, maxG = 0
  while (kmh(car.forwardSpeed()) > 80 && t < 10) { car.step(DT, { throttle: 0, brake: 1, steer: 0 }); d += car.speed * DT; t += DT; maxG = Math.max(maxG, -car.gLong) }
  check('freinage 300→80 km/h', d > 55 && d < 150 && maxG > 4 && maxG < 6.5, `${d.toFixed(1)} m en ${t.toFixed(2)} s, décélération max ${maxG.toFixed(2)} g, Tdisque AV ${car.wheels[0].brakeT.toFixed(0)} °C (freinage idéal en ligne droite ; ordre de grandeur Brembo pour La Source ≈ 120–130 m avec relâchement progressif, chiffre non vérifié)`)
}
// 4. virage stabilisé (skidpad R = 120 m) à vitesse croissante → g latéral max
{
  const car = new Vehicle(new FlatSurface()); car.setup.steerAssist = 0; car.setup.stability = 0; car.placeAt(0, 0, 30)
  let maxG = 0
  for (let i = 0; i < 240 * 25; i++) {
    const v = car.forwardSpeed(); const target = 30 + i * DT * 2.4
    const st = (3.641 / 120 + 0.03) / 0.32
    car.step(DT, { throttle: v < target ? 0.8 : 0.2, brake: 0, steer: st })
    if (Math.abs(car.gLat) > maxG && car.wheels.every(w => Math.abs(w.alpha) < 0.2)) maxG = Math.abs(car.gLat)
  }
  check('g latéral max', maxG > 3.0 && maxG < 6.5, `${maxG.toFixed(2)} g (réf. F1 2020 ≈ 4–5 g en courbe rapide, E)`)
}
// 5. tour de Spa en pilote automatique (calibration : pole Hamilton 1:41.252, ~328 km/h fin de Kemmel)
{
  const meta = JSON.parse(readFileSync(new URL('../public/track/surface.json', import.meta.url), 'utf8'))
  const buf = readFileSync(new URL('../public/track/surface.bin', import.meta.url))
  const grid = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
  const track = new TrackSurface(meta, grid)
  const t0 = Date.now(); const line = buildRacingLine(track, 1600, 1.0); const tl = Date.now() - t0
  const car = new Vehicle(track); car.setup.steerAssist = 0; car.setup.stability = 0
  const ap = new Autopilot(line, Number(process.env.PACE ?? 1.06))
  const session = new Session(track.length, 'timetrial'); const timing = session.timing
  car.placeAt(6750, 0, 60)
  let t = 0, laps = 0, maxV = 0, vKemmel = 0, vTrap = 0, offs = 0, hits = 0, minSoc = 9e9
  const trace: number[][] = []
  const tStart = Date.now()
  while (t < 340 && laps < 3) {
    const s = car.s
    void s
    const c = ap.control(car)
    car.step(DT, c); t += DT
    session.update(car, t, DT)
    if (timing.events.includes('lap')) { laps++; console.log('   tour', laps, fmt(timing.lastLap!.time), timing.lastLap!.sectors.map(x => x.toFixed(3)).join(' / '), timing.lastLap!.valid ? 'valide' : 'invalide') }
    if (timing.lapStart >= 0 && laps >= 1) {
      const v = kmh(car.forwardSpeed()); maxV = Math.max(maxV, v)
      if (Math.abs(car.s - 2161 * track.length / 7001.7) < 0.6) vKemmel = v
      if (Math.abs(car.s - 6703 + 200) < 0.6) vTrap = v
      if (car.offTrack) offs++; if (car.impact > 0.2) hits++
      minSoc = Math.min(minSoc, car.ers.soc)
      if ((Math.round(t * 240) % 24) === 0) trace.push([+car.s.toFixed(1), +v.toFixed(1), car.gear, Math.round(car.rpm), +car.throttleApplied.toFixed(2), +car.brakeApplied.toFixed(2), +(car.ers.soc / 1e6).toFixed(3), +car.wheels[0].tyre.temp.toFixed(1), +car.wheels[2].tyre.temp.toFixed(1), +car.wheels[0].brakeT.toFixed(0), +car.d.toFixed(2)])
    }
    if (car.flipped > 1) { console.log('   retourné à s=', car.s); break }
  }
  const wall = (Date.now() - tStart) / 1000
  writeFileSync(new URL('../../reports/lap_trace.json', import.meta.url), JSON.stringify({ fields: ['s', 'kmh', 'gear', 'rpm', 'thr', 'brk', 'socMJ', 'tFL', 'tRL', 'bFL', 'd'], trace }))
  const best = timing.best?.time ?? Infinity
  check('tour de Spa (pilote auto, ligne calculée)', best > 99 && best < 105, `${fmt(best)} (pole Hamilton 2020 : 1:41.252) — ligne ${tl} ms, simu ${wall.toFixed(1)} s, sorties ${offs} pas, chocs ${hits}`)
  check('vitesse fin de Kemmel (DRS)', vKemmel > 315 && vKemmel < 340, `${vKemmel.toFixed(1)} km/h à s=2161 (réf. I1 qualif HAM 328,4 km/h) ; max ${maxV.toFixed(1)}`)
  const L = car.ers.last
  check('ERS : bilan du dernier tour (≤ 4 MJ déployés, ≤ 2 MJ récupérés MGU-K, P)', minSoc >= 0 && L.deployed > 1e6 && L.deployed <= 4e6 + 1 && L.harvested > 0.3e6 && L.harvested <= 2e6 + 1, `déployé batterie→K ${(L.deployed / 1e6).toFixed(2)} MJ, récupéré K→batterie ${(L.harvested / 1e6).toFixed(2)} MJ, H→K direct ${(L.hToK / 1e6).toFixed(2)} MJ, SOC min ${(minSoc / 1e6).toFixed(2)} MJ`)
  console.log('   vitesse 200 m avant Bus Stop', vTrap.toFixed(1), 'km/h; pneus AV/AR', car.wheels[0].tyre.temp.toFixed(0), car.wheels[2].tyre.temp.toFixed(0), '°C')
}
console.log('rapports (vitesse à 12 500 tr/min) :', GEAR_RATIOS.map(r => r.toFixed(2)).join(' '), '; P_ICE 11 000 tr/min =', (icePower(11000, 1, 'quali') / 1000).toFixed(0), 'kW')
writeFileSync(new URL('../../reports/physics_tests.json', import.meta.url), JSON.stringify(results, null, 1))
const fails = results.filter(r => !r.ok).length
console.log(fails ? `${fails} échec(s)` : 'tous les tests passent')
process.exitCode = fails ? 1 : 0
