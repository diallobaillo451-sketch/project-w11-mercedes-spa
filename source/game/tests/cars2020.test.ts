// Lot 8 B — validation du tour de Spa de chaque voiture 2020 (pilote automatique, ligne recalculée par voiture)
// comparé au meilleur temps de qualification 2020 de l'équipe : écart à la W11 simulé vs écart réel.
// usage : npx tsx tests/cars2020.test.ts [ids] ; CAL=1 → recherche de ClA (dichotomie) pour coller à l'écart réel
import { readFileSync, writeFileSync } from 'node:fs'
import { TrackSurface } from '../src/track/surface.ts'
import { Vehicle } from '../src/physics/vehicle.ts'
import { Autopilot } from '../src/physics/autopilot.ts'
import { buildRacingLine } from '../src/track/racingLine.ts'
import { Session } from '../src/core/session.ts'
import { CARS2020, applyCarPhysics } from '../src/physics/cars2020.ts'
import { W11 } from '../src/physics/params.ts'
const DT = 1 / 240
const meta = JSON.parse(readFileSync(new URL('../public/track/surface.json', import.meta.url), 'utf8'))
const buf = readFileSync(new URL('../public/track/surface.bin', import.meta.url))
const track = new TrackSurface(meta, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2))
{ const bb = readFileSync(new URL('../public/track/barriers.bin', import.meta.url)); track.barriers = new (await import('../src/track/barriers.ts')).Barriers(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength)) }
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`
function lap(id: string, ClA?: number) {
  applyCarPhysics(id); if (ClA) W11.ClA = ClA
  const line = buildRacingLine(track, 1600, 1.0)
  const car = new Vehicle(track); car.setup.steerAssist = 0; car.setup.stability = 0
  const ap = new Autopilot(line, Number(process.env.PACE ?? 1.06))
  const session = new Session(track.length, 'timetrial'); const timing = session.timing
  car.placeAt(6750, 0, 60)
  let t = 0, laps = 0, vTrap = 0, vI1 = 0
  while (t < 240 && laps < 2) {
    car.step(DT, ap.control(car)); t += DT; session.update(car, t, DT)
    if (timing.events.includes('lap')) laps++
    if (laps >= 1) { const v = car.forwardSpeed() * 3.6
      if (Math.abs(car.s - 2161 * track.length / 7001.7) < 0.6) vI1 = v
      if (Math.abs(car.s - 440 * track.length / 7001.7) < 0.6) vTrap = v }
  }
  return { best: timing.best?.time ?? Infinity, vI1, vTrap }
}
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CARS2020)
const ref = lap('w11'); console.log('w11', fmt(ref.best), 'I1', ref.vI1.toFixed(1), 'trap', ref.vTrap.toFixed(1))
const rows: Record<string, unknown>[] = [{ id: 'w11', sim: +ref.best.toFixed(3), real: CARS2020.w11.spaQ, dSim: 0, dReal: 0, vI1: +ref.vI1.toFixed(1), vTrap: +ref.vTrap.toFixed(1), ClA: CARS2020.w11.ClA }]
for (const id of ids.filter(x => x !== 'w11')) {
  const c = CARS2020[id], dReal = c.spaQ - CARS2020.w11.spaQ
  let ClA = c.ClA, r = lap(id, ClA)
  if (process.env.CAL) { let lo = 4.6, hi = 6.2
    for (let k = 0; k < 7; k++) { const d = r.best - ref.best; if (d > dReal) lo = ClA; else hi = ClA; ClA = (lo + hi) / 2; r = lap(id, ClA) } }
  const dSim = r.best - ref.best
  console.log(id.padEnd(12), fmt(r.best), 'Δsim', dSim.toFixed(3), 'Δréel', dReal.toFixed(3), 'I1', r.vI1.toFixed(1), `(réel ${c.spaI1})`, 'ClA', ClA.toFixed(3), 'CdA', c.CdA)
  rows.push({ id, sim: +r.best.toFixed(3), real: c.spaQ, dSim: +dSim.toFixed(3), dReal: +dReal.toFixed(3), vI1: +r.vI1.toFixed(1), realI1: c.spaI1, vTrap: +r.vTrap.toFixed(1), ClA: +ClA.toFixed(3), CdA: c.CdA })
}
writeFileSync(new URL('../../reports/cars2020_spa.json', import.meta.url), JSON.stringify(rows, null, 1))
const bad = rows.filter(r => Math.abs((r.dSim as number) - (r.dReal as number)) > 0.35)
console.log(bad.length ? `ÉCHEC : ${bad.map(r => r.id).join(', ')} hors ±0,35 s` : 'OK : toutes les voitures à ±0,35 s de l’écart réel à la W11')
