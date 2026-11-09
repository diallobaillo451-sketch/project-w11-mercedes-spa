import { readFileSync } from 'node:fs'
import { Vehicle } from '../src/physics/vehicle.ts'
import { TrackSurface } from '../src/track/surface.ts'
import { buildRacingLine } from '../src/track/racingLine.ts'
import { Autopilot } from '../src/physics/autopilot.ts'
import { Session } from '../src/core/session.ts'
const meta = JSON.parse(readFileSync('public/track/surface.json', 'utf8'))
const buf = readFileSync('public/track/surface.bin')
const track = new TrackSurface(meta, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2))
const line = buildRacingLine(track, 0, Number(process.env.MU ?? 1.35))
const car = new Vehicle(track); car.setup.steerAssist = 0; car.setup.stability = 0
const ap = new Autopilot(line, Number(process.env.PACE ?? 1))
if (process.env.NOLINE) line.e.fill(0)
const S0 = Number(process.env.S0 ?? 6750); car.placeAt(S0, 0, Number(process.env.V0 ?? 60))
const session = new Session(track.length)
const DT = 1 / 240; let t = 0, lastS = car.s, tLap = -1, vmax = 0, vComb = 0, offs = 0, dmax = 0
const T = Number(process.env.T ?? 12), EVERY = Number(process.env.EVERY ?? 24)
for (let i = 0; i < T * 240; i++) {
  const c = ap.control(car); car.step(DT, c); t += DT; session.update(car, t, DT)
  if (session.timing.events.includes('lap')) { const L = session.timing.lastLap!; console.log('TIMING', L.time.toFixed(3), L.sectors.map(x => x.toFixed(2)).join(' '), L.valid ? 'valide' : 'INVALIDE', 'soc', (car.ers.soc / 1e6).toFixed(2)) }
  if ((i % EVERY === 0 && t >= Number(process.env.FROM ?? 0)) || (car.flipped > 0 && car.flipped < 0.02)) {
    const w = car.wheels
    console.log(t.toFixed(2), 's', car.s.toFixed(1), 'd', car.d.toFixed(2), 'eLine', line.e[car.trackIdx].toFixed(2), 'v', (car.forwardSpeed() * 3.6).toFixed(1), 'vt', (line.v[car.trackIdx] * 3.6).toFixed(0), 'g', car.gear, 'rpm', car.rpm.toFixed(0),
      'thr', c.throttle.toFixed(2), 'brk', c.brake.toFixed(2), 'st', c.steer.toFixed(2), 'up', car.R[4].toFixed(3), 'wb', car.wb.map(x => x.toFixed(2)).join(','),
      'c', w.map(x => (x.c * 1000).toFixed(0)).join('/'), 'fz', w.map(x => (x.fz / 1000).toFixed(1)).join('/'), 'typ', w.map(x => x.type).join(''), 'k', w.map(x => x.kappa.toFixed(2)).join('/'), 'a', w.map(x => x.alpha.toFixed(2)).join('/'), 'tc', car.tcCut.toFixed(2), 'thrA', car.throttleApplied.toFixed(2))
  }
  const v = car.forwardSpeed() * 3.6; vmax = Math.max(vmax, v)
  if (car.s > 2150 && car.s < 2290) vComb = Math.max(vComb, v)
  dmax = Math.max(dmax, Math.abs(car.d - line.e[car.trackIdx]))
  if (lastS > track.length - 200 && car.s < 200) { if (tLap >= 0) console.log('LAP', (t - tLap).toFixed(3), 'vmax', vmax.toFixed(1), 'vAvantCombes', vComb.toFixed(1), 'ecartMax', dmax.toFixed(2)); tLap = t; vmax = 0; vComb = 0; dmax = 0 }
  lastS = car.s
  if (car.flipped > 0.1) { console.log('FLIP at', car.s.toFixed(0)); break }
}
