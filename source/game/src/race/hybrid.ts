/** Physique hybride : au plus 4 IA (celles juste devant et derrière le joueur) tournent le même
 *  modèle Vehicle que le joueur, avec la physique de LEUR équipe. Les autres restent en 1D.
 *  Hystérésis : une voiture déjà promue le reste tant qu'elle est dans les 6 plus proches.
 *  Intégration à 240 Hz (sous-pas), comme le joueur. Le W11 global est restauré après chaque voiture. */
import type { RaceSim, Racer } from './sim.ts'
import { Vehicle, type Controls } from '../physics/vehicle.ts'
import { applyCarPhysics, currentCar } from '../physics/cars2020.ts'
import { W11 } from '../physics/params.ts'

export interface DriveCmd { vt: number; dT: number; cap?: number }
const MAX = 4
const SUB = 1 / 240

export class HybridBank {
  private slots: { v: Vehicle; r: Racer | null }[] = []
  constructor(sim: RaceSim) {
    for (let i = 0; i < MAX; i++) {
      const v = new Vehicle(sim.track)
      v.damageMode = 'real'
      v.env = sim.vehicle?.env ?? null
      this.slots.push({ v, r: null })
    }
  }
  active(r: Racer) { return this.slots.some(s => s.r === r) }
  /** choisit 2 devant + 2 derrière, en gardant celles qui sont encore dans le top 6 */
  pick(sim: RaceSim, near: Set<number>) {
    const p = sim.player
    const pool = sim.cars.filter(o => o !== p && sim.onTrack(o) && o.mode !== 'pit' && o.mode !== 'grid' && o.mode !== 'garage' && o.mode !== 'dnf' && o.mode !== 'redq' && o.mode !== 'spun')
    const gap = (o: Racer) => sim.road(p.s, o.s)
    const ahead = pool.filter(o => gap(o) >= 0).sort((a, b) => gap(a) - gap(b))
    const behind = pool.filter(o => gap(o) < 0).sort((a, b) => gap(b) - gap(a))
    const ideal: Racer[] = [...ahead.slice(0, 2), ...behind.slice(0, 2)]
    for (const o of [...ahead.slice(2), ...behind.slice(2)]) { if (ideal.length >= MAX) break; ideal.push(o) }
    const ranked = pool.slice().sort((a, b) => Math.abs(gap(a)) - Math.abs(gap(b)))
    const keep: Racer[] = []
    for (const id of near) {
      const r = sim.cars[id]
      if (!r) continue
      const rank = ranked.indexOf(r)
      if (rank >= 0 && rank < 6) keep.push(r)
    }
    const next: Racer[] = []
    for (const r of keep) { if (next.length < MAX) next.push(r) }
    for (const r of ideal) { if (next.length >= MAX) break; if (!next.includes(r)) next.push(r) }
    near.clear()
    for (const r of next) near.add(r.i)
    const want = new Set(next)
    for (const s of this.slots) if (s.r && !want.has(s.r)) { s.r.q = null; s.r = null }
    for (const r of next) {
      let s = this.slots.find(x => x.r === r)
      if (!s) {
        s = this.slots.find(x => !x.r)
        if (!s) continue
        s.r = r
        s.v.env = sim.vehicle?.env ?? s.v.env
        s.v.placeAt(r.s, r.d, Math.max(0, r.v))
        s.v.fuel = r.fuel
        s.v.damage.frontWing = r.dmg.fw; s.v.damage.rearWing = r.dmg.rw; s.v.damage.floor = r.dmg.floor
      }
    }
  }
  step(sim: RaceSim, dt: number) {
    const n = Math.max(1, Math.min(8, Math.round(dt / SUB)))
    const h = dt / n
    const prev = currentCar()
    for (const s of this.slots) {
      const r = s.r
      if (!r) continue
      if (!sim.near.has(r.i) || !sim.onTrack(r)) { r.q = null; s.r = null; continue }
      const v = s.v
      v.fuel = r.fuel
      v.damage.frontWing = Math.max(v.damage.frontWing, r.dmg.fw)
      v.damage.rearWing = Math.max(v.damage.rearWing, r.dmg.rw)
      v.damage.floor = Math.max(v.damage.floor, r.dmg.floor)
      v.drsAvailable = !!(r.drs && sim.inZone(r.s))
      const cmd = sim.cmd.get(r.i) ?? { vt: r.v, dT: r.d }
      const carId = r.car === 'w11' ? 'w11' : r.car
      applyCarPhysics(carId)
      const ctl = drive(sim, r, v, cmd)
      for (let k = 0; k < n; k++) v.step(h, ctl)
      const prevS = r.s
      r.s = v.s; r.d = v.d; r.v = Math.max(0, v.forwardSpeed()); r.idx = v.trackIdx
      r.dist += sim.road(prevS, r.s); r.lastS = r.s
      r.wx = v.pos[0]; r.wy = v.pos[1]; r.wz = v.pos[2]
      r.hx = -v.R[6]; r.hz = -v.R[8]
      r.nx = v.R[3]; r.ny = v.R[4]; r.nz = v.R[5]
      r.q = [v.q[0], v.q[1], v.q[2], v.q[3]]
      r.steer = ctl.steer
      r.dmg.fw = v.damage.frontWing; r.dmg.rw = v.damage.rearWing; r.dmg.floor = v.damage.floor
    }
    applyCarPhysics(prev)
  }
  /** la séparation 1D a poussé la voiture : on décale le corps rigide pour que ça tienne */
  nudge(sim: RaceSim) {
    for (const s of this.slots) {
      const r = s.r; if (!r) continue
      const dd = r.d - s.v.d
      if (Math.abs(dd) > 0.02) {
        const c = sim.track.centre(s.v.s)
        s.v.pos[0] += -c.tz * dd; s.v.pos[2] += c.tx * dd; s.v.d = r.d
        r.wx = s.v.pos[0]; r.wz = s.v.pos[2]
      }
      const vv = Math.max(0, s.v.forwardSpeed())
      if (r.v < vv - 0.4) { const f = Math.max(0, r.v) / Math.max(0.5, vv); s.v.vel[0] *= f; s.v.vel[2] *= f }
    }
  }
}

function drive(sim: RaceSim, r: Racer, car: Vehicle, cmd: DriveCmd): Controls {
  const v = Math.max(0, car.forwardSpeed())
  const look = 6 + v * 0.28
  const c = sim.track.centre(sim.wrapS(car.s + look))
  const tx = c.x + -c.tz * cmd.dT - car.pos[0]
  const tz = c.z + c.tx * cmd.dT - car.pos[2]
  const R = car.R
  const lx = tx * R[0] + tz * R[2], lz = tx * R[6] + tz * R[8]
  const alpha = Math.atan2(lx, -lz)
  const dist = Math.hypot(lx, lz) || 1
  const delta = Math.atan(2 * W11.wheelbase * Math.sin(alpha) / Math.max(dist, 3))
  const lock = W11.steerLock * Math.max(0.15, 1 / (1 + (v * v) / (34 * 34)))
  const steer = Math.max(-1, Math.min(1, delta / lock))
  const err = cmd.vt - v
  let throttle = 0, brake = 0
  if (r.mode === 'spun' || r.err?.kind === 'launch') { brake = 1 }
  else if (err > 0.4) throttle = Math.min(1, 0.4 + err * 0.35)
  else if (err < -1) brake = Math.min(1, -err * 0.14)
  else throttle = 0.28
  if (r.mode === 'out' || r.mode === 'cool' || r.mode === 'in') throttle = Math.min(throttle, 0.55)
  return { throttle, brake, steer, drs: !!(r.drs && sim.inZone(r.s)), noReverse: true }
}
