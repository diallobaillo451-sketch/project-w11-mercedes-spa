/** Physique hybride : au plus 4 IA (celles juste devant et derrière le joueur) tournent le même
 *  modèle Vehicle que le joueur, avec la physique de LEUR équipe. Les autres restent en 1D.
 *  Hystérésis : une voiture déjà promue le reste tant qu'elle est dans les 6 plus proches.
 *  Intégration à 240 Hz (sous-pas), comme le joueur. Le W11 global est restauré après chaque voiture.
 *  Conduite et détection d'incidents : driver.ts (AiDriver). À la promotion la voiture reçoit sa gomme et sa température
 *  (modèle 1D), le cap de la ligne de course, des pièces neuves puis ses dégâts, une batterie pleine ; l'ERS repart à zéro à chaque tour. */
import type { RaceSim, Racer } from './sim.ts'
import { Vehicle } from '../physics/vehicle.ts'
import { applyCarPhysics, currentCar } from '../physics/cars2020.ts'
import { W11, type Compound } from '../physics/params.ts'
import { AiDriver, type DriveCmd } from './driver.ts'
import { AI_GRIP } from './tuning.ts'
export type { DriveCmd } from './driver.ts'

const MAX = 6 // emplacements alloués ; sim.hybridMax (4 en jeu, 6 en mode TV) borne le nombre réellement actif
const SUB = 1 / 240
/** gomme du modèle 1D → composé Pirelli du modèle physique */
const COMP: Record<string, Compound> = { S: 'C4', M: 'C3', H: 'C2', I: 'I', W: 'W' }

interface Slot { v: Vehicle; r: Racer | null; d: AiDriver }

export class HybridBank {
  private slots: Slot[] = []
  constructor(sim: RaceSim) {
    for (let i = 0; i < MAX; i++) {
      const v = new Vehicle(sim.track)
      v.damageMode = 'real'
      v.env = sim.vehicle?.env ?? null
      v.setup.stability = 0.5 // aide au lacet (n'agit qu'en survirage) : les IA ne sont pas censées finir dans le décor
      this.slots.push({ v, r: null, d: new AiDriver() })
    }
  }
  active(r: Racer) { return this.slots.some(s => s.r === r) }
  /** corps rigide d'une IA en physique complète (null si elle est en 1D) : contacts, impulsions */
  vehicleOf(r: Racer): Vehicle | null { for (const s of this.slots) if (s.r === r) return s.v; return null }
  /** choisit 2 devant + 2 derrière, en gardant celles qui sont encore dans le top 6 */
  pick(sim: RaceSim, near: Set<number>) {
    const pl = sim.player
    // mode TV / spectateur : la physique complète se recentre sur la voiture regardée (le joueur est alors arrêté ou hors course)
    const p = sim.focus && sim.focus !== pl ? sim.focus : pl
    const cap = Math.max(1, Math.min(MAX, Math.round(sim.hybridMax))), half = Math.ceil(cap / 2)
    const pool = sim.cars.filter(o => o !== pl && sim.onTrack(o) && o.mode !== 'pit' && o.mode !== 'grid' && o.mode !== 'garage' && o.mode !== 'dnf' && o.mode !== 'redq' && o.mode !== 'spun')
    const gap = (o: Racer) => sim.road(p.s, o.s)
    const ahead = pool.filter(o => gap(o) >= 0).sort((a, b) => gap(a) - gap(b))
    const behind = pool.filter(o => gap(o) < 0).sort((a, b) => gap(b) - gap(a))
    const ideal: Racer[] = [...ahead.slice(0, half), ...behind.slice(0, cap - half)]
    for (const o of [...ahead.slice(half), ...behind.slice(cap - half)]) { if (ideal.length >= cap) break; ideal.push(o) }
    const ranked = pool.slice().sort((a, b) => Math.abs(gap(a)) - Math.abs(gap(b)))
    const keep: Racer[] = []
    for (const id of near) {
      const r = sim.cars[id]
      if (!r) continue
      const rank = ranked.indexOf(r)
      if (rank >= 0 && rank < cap + 2) keep.push(r)
    }
    const next: Racer[] = []
    for (const r of keep) { if (next.length < cap) next.push(r) }
    for (const r of ideal) { if (next.length >= cap) break; if (!next.includes(r)) next.push(r) }
    near.clear()
    for (const r of next) near.add(r.i)
    const want = new Set(next)
    for (const s of this.slots) if (s.r && !want.has(s.r)) { this.release(sim, s) }
    for (const r of next) {
      if (this.slots.some(x => x.r === r)) continue
      const s = this.slots.find(x => !x.r)
      if (s) this.assign(sim, s, r)
    }
  }
  /** retour au modèle 1D : la dérive latérale reprend le cap réel de la voiture (la voiture 1D se dessine « tangente + dérive ») → pas de saut de cap visible */
  private release(sim: RaceSim, s: Slot) {
    const r = s.r; if (!r) return
    const c = sim.track.centre(r.s), R = s.v.R, hx = -R[6], hz = -R[8], n = Math.hypot(hx, hz)
    if (n > 1e-6 && r.v > 3) { const a = Math.atan2((hx * -c.tz + hz * c.tx) / n, (hx * c.tx + hz * c.tz) / n); if (Number.isFinite(a) && Math.abs(a) < 0.5) r.lat = r.v * Math.tan(a) }
    r.q = null; s.r = null
  }
  /** une IA passe en physique : gomme + température du modèle 1D, pièces neuves puis dégâts du modèle 1D, cap de la ligne de course, batterie pleine */
  private assign(sim: RaceSim, s: Slot, r: Racer) {
    const v = s.v
    s.r = r
    v.env = sim.vehicle?.env ?? v.env
    v.setup.engineMode = 'quali' // IA : pleine puissance en course comme en qualif
    const comp = COMP[r.tyre.c] ?? 'C3'
    const t = W11.tyre.window[comp][0] + (Math.max(0.3, Math.min(1.05, r.tyre.temp)) - 1) * 40 // 1 = bas de la fenêtre de température
    v.fitTyres(comp, t, t)
    v.repair()
    v.damage.frontWing = r.dmg.fw; v.damage.rearWing = r.dmg.rw; v.damage.floor = r.dmg.floor
    // cap : direction de la ligne de course (pas de coup de volant à l'apparition)
    const L = sim.line, T = sim.track, N = L.N, i = r.idx, a = (i + 4) % N, b = (i - 4 + N) % N
    const lx = L.x[a] - L.x[b], lz = L.z[a] - L.z[b]
    // cap affiché en 1D (tangente + dérive) : promotion sans saut visible ; dérive extrême → direction de la ligne.
    const yaw1D = Math.atan2(r.lat, Math.max(3, r.v)), yaw = r.v > 5 ? (Math.abs(r.lat) < r.v * 0.4 ? yaw1D : Math.atan2(T.tx[i] * lz - T.tz[i] * lx, T.tx[i] * lx + T.tz[i] * lz)) : 0
    v.placeAt(r.s, r.d, Math.max(0, r.v), yaw)
    v.fuel = W11.fuelQuali
    v.ers.soc = 3.4e6; v.ers.newLap()
    s.d.reset()
  }
  step(sim: RaceSim, dt: number) {
    const n = Math.max(1, Math.min(8, Math.round(dt / SUB)))
    const h = dt / n
    const prev = currentCar(), mu0 = W11.tyre.mu0
    for (const s of this.slots) {
      const r = s.r
      if (!r) continue
      if (!sim.near.has(r.i) || !sim.onTrack(r)) { this.release(sim, s); continue }
      const v = s.v
      v.fuel = W11.fuelQuali // IA : masse d'essence du profil de vitesse, en course comme en qualif (même rythme) ; qualif / essais : la masse du profil de vitesse (essence de qualif), pas les 30 kg du modèle 1D
      v.damage.frontWing = Math.max(v.damage.frontWing, r.dmg.fw)
      v.damage.rearWing = Math.max(v.damage.rearWing, r.dmg.rw)
      v.damage.floor = Math.max(v.damage.floor, r.dmg.floor)
      v.drsAvailable = !!(r.drs && sim.inZone(r.s))
      // aspiration : voiture devant la plus proche (même logique que pour le joueur)
      let lead: { gap: number; lat: number } | null = null
      for (const o of sim.cars) {
        if (o === r || !sim.onTrack(o)) continue
        const g = sim.road(r.s, o.s)
        if (g > 0 && g < 120 && (!lead || g - 5.6 < lead.gap)) lead = { gap: g - 5.6, lat: o.d - r.d }
      }
      v.lead = lead
      const cmd = sim.cmd.get(r.i) ?? { vt: r.v, dT: r.d }
      applyCarPhysics(r.car)
      const ctl = s.d.control(sim, r, v, cmd, dt)
      W11.tyre.mu0 = mu0 * AI_GRIP // bonus d'adhérence des IA (tuning.ts), rendu juste après le pas physique
      for (let k = 0; k < n; k++) v.step(h, ctl)
      W11.tyre.mu0 = mu0
      // physique en vrac (NaN) : voiture détruite plutôt que de contaminer la simulation
      if (!Number.isFinite(v.s) || !Number.isFinite(v.d) || !Number.isFinite(v.pos[0]) || !Number.isFinite(v.pos[2]) || !Number.isFinite(v.vel[0])) { sim.physIncident(r, 'wreck', 0); r.q = null; s.r = null; continue }
      const prevS = r.s
      r.s = v.s; r.d = v.d; r.v = Math.max(0, v.forwardSpeed()); r.idx = v.trackIdx
      r.dist += sim.road(prevS, r.s); r.lastS = r.s
      r.wx = v.pos[0]; r.wy = v.pos[1]; r.wz = v.pos[2]
      r.hx = -v.R[6]; r.hz = -v.R[8]
      r.nx = v.R[3]; r.ny = v.R[4]; r.nz = v.R[5]
      r.q = [v.q[0], v.q[1], v.q[2], v.q[3]]
      r.steer = ctl.steer
      r.dmg.fw = v.damage.frontWing; r.dmg.rw = v.damage.rearWing; r.dmg.floor = v.damage.floor
      // l'ERS du modèle physique se recharge à la ligne (sinon plus de déploiement après le 1er tour : ≈ −10 % de puissance)
      if (r.s < prevS - sim.L * 0.5) { v.ers.newLap(); v.ers.soc = Math.max(v.ers.soc, 3.4e6) }
      // tête-à-queue, immobilisée, épave : retour au modèle 1D avec incident (drapeaux jaunes, SC, abandon)
      if (s.d.event) { sim.physIncident(r, s.d.event, s.d.yaw); r.q = null; s.r = null }
    }
    W11.tyre.mu0 = mu0
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
