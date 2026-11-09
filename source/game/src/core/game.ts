/** Boucle de simulation : pas fixe 240 Hz découplé de l'affichage, état précédent/courant pour interpolation,
 *  session (chrono, DRS, limites de piste), remise en piste, meilleur tour persistant (localStorage). */
import { Vehicle, type Controls } from '../physics/vehicle.ts'
import { TrackEnv, type Weather } from '../physics/env.ts'
import { TrackSurface } from '../track/surface.ts'
import { buildRacingLine, type RacingLine } from '../track/racingLine.ts'
import { Autopilot } from '../physics/autopilot.ts'
import { Session, type SessionKind } from './session.ts'
import { EventBus } from './events.ts'
import type { Pitlane } from '../track/pitlane.ts'

export const DT = 1 / 240
const MAX_STEPS = 12 // au-delà : ralenti plutôt que spirale de la mort

export interface Pose { pos: number[]; q: number[] }
export interface GameEvents { lap?: { time: number; valid: boolean; best: boolean }; sector?: number; invalid?: boolean; reset?: boolean; pitEntry?: boolean; pitExit?: boolean; pitSpeeding?: number; repair?: boolean }

export class Game {
  track: TrackSurface; line: RacingLine; car: Vehicle; session: Session
  auto: Autopilot; autopilot = false
  prev: Pose = { pos: [0, 0, 0], q: [0, 0, 0, 1] }
  prevWheels: { c: number; angle: number; steer: number }[] = []
  acc = 0; time = 0; alpha = 0; paused = false
  ctl: Controls = { throttle: 0, brake: 0, steer: 0 }
  steerVis = 0
  events: GameEvents = {}
  bestKey = 'w11.best.spa'
  storedBest: number | null = null
  private stuckT = 0
  shifts = 0; maxScrape = 0; maxImpact = 0
  /** bus d'événements de course (radio, HUD, volant ; plus tard tout le plateau) */
  bus = new EventBus()
  /** voie des stands (limiteur automatique 80 km/h, pénalité d'excès de vitesse) */
  pit: Pitlane | null = null; pitServed = false; inPit = false; pitSpeedT = 0; pitStopT = 0; pitPenalised = false; penalties = 0
  private lastFlag = ''; private lastDmg = 0
  /** état de piste / météo partagé (physique, rendu, audio) */
  env: TrackEnv; private envAcc = 0
  /** débris physiques restés sur la piste (pièces arrachées) : position, vitesse, au repos ou non */
  debris: { part: string; pos: number[]; vel: number[]; rest: boolean; rot: number[]; spin: number[] }[] = []
  constructor(track: TrackSurface, kind: SessionKind = 'timetrial') {
    this.track = track
    this.line = buildRacingLine(track, 1600, 1.0)
    this.car = new Vehicle(track)
    this.env = new TrackEnv(track.length, s => this.lineOffset(s)); this.car.env = this.env
    this.auto = new Autopilot(this.line, 1.06) // E : marge pilote calée (après muX 0,67) → tour ≈ 1:41,75 (pole réelle 1:41,252)
    this.session = new Session(track.length, kind)
    try { const b = localStorage.getItem(this.bestKey); this.storedBest = b ? Number(b) : null } catch { this.storedBest = null }
    this.start(kind)
  }
  /** Départ lancé (contre-la-montre : tour de sortie court avant la ligne) ou arrêté aux stands. */
  sessionId = 0
  start(kind: SessionKind = this.session.kind) {
    this.sessionId++
    this.session = new Session(this.track.length, kind)
    const L = this.track.length
    if (kind === 'timetrial') { const s0 = L - 200; this.car.placeAt(s0, this.lineOffset(s0), 55) }
    else this.car.placeAt(L - 120, this.lineOffset(L - 120), 0)
    this.car.ers.soc = 4.0e6
    this.car.fuel = 12; this.car.repair(); this.car.fitTyres(); this.lastDmg = 0; this.debris = []
    // piste de la session : contre-la-montre = piste déjà gommée (fin de qualif), essais = piste plus verte qui évolue
    this.env?.setEvolution(kind === 'timetrial' ? 0.75 : 0.35); this.env?.setWeather(this.env.weather)
    this.snapshot(); this.acc = 0
  }
  lineOffset(s: number) { const i = Math.floor(((s % this.track.length) + this.track.length) % this.track.length / this.line.ds) % this.line.N; return this.line.e[i] }
  /** Remise en piste à l'abscisse courante, sur la trajectoire, à vitesse réduite. */
  resetCar() {
    const s = this.car.s
    this.car.placeAt(s, this.lineOffset(s), 8)
    this.session.timing.invalidate(); this.events.reset = true; this.bus.emit({ t: 'reset', car: 0 })
    this.snapshot()
  }
  snapshot() {
    const c = this.car
    this.prev.pos[0] = c.pos[0]; this.prev.pos[1] = c.pos[1]; this.prev.pos[2] = c.pos[2]
    this.prev.q[0] = c.q[0]; this.prev.q[1] = c.q[1]; this.prev.q[2] = c.q[2]; this.prev.q[3] = c.q[3]
    this.prevWheels = c.wheels.map(w => ({ c: w.c, angle: w.angle, steer: w.steer }))
  }
  /** Avance la simulation du temps réel écoulé (s). */
  advance(realDt: number) {
    this.events = {}; this.shifts = 0; this.maxScrape = 0; this.maxImpact = 0
    if (this.paused) { this.alpha = 1; return }
    this.acc += Math.min(realDt, 0.1)
    let n = 0
    while (this.acc >= DT && n < MAX_STEPS) {
      this.snapshot()
      const ctl = this.autopilot ? this.auto.control(this.car) : this.ctl
      if (this.inPit) ctl.pitLim = true
      this.car.step(DT, ctl)
      if (this.car.shiftEvent) { this.shifts++; this.ctl.shiftUp = false; this.ctl.shiftDown = false }
      this.maxScrape = Math.max(this.maxScrape, this.car.scrape); this.maxImpact = Math.max(this.maxImpact, this.car.impact)
      this.time += DT
      this.session.update(this.car, this.time, DT)
      const ev = this.session.timing.events
      if (ev.includes('lap')) {
        const r = this.session.timing.lastLap!
        const best = !this.autopilot && ev.includes("best") && r.valid && (this.storedBest === null || r.time < this.storedBest)
        if (best) { this.storedBest = r.time; try { localStorage.setItem(this.bestKey, String(r.time)) } catch { /* mode privé */ } }
        this.events.lap = { time: r.time, valid: r.valid, best }
      }
      for (const e of ev) if (e.startsWith('sector')) this.events.sector = Number(e.slice(6))
      if (ev.includes('invalid')) this.events.invalid = true
      this.acc -= DT; n++
    }
    if (n === MAX_STEPS) this.acc = 0
    // piste / météo à 10 Hz ; débris
    this.envAcc += Math.min(realDt, 0.1)
    if (this.envAcc >= 0.1) { this.env.update(this.envAcc, this.session.timing.best?.time ?? 106); this.envAcc = 0 }
    this.updateDebris(Math.min(realDt, 0.05))
    this.updatePit(realDt)
    const c0 = this.car, ses = this.session
    if (ses.flag !== this.lastFlag) { this.lastFlag = ses.flag; this.bus.emit({ t: 'flag', car: 0, flag: ses.flag }) }
    if (this.maxImpact > 0.3) this.bus.emit({ t: 'impact', car: 0, k: this.maxImpact, kind: c0.hitKind })
    if (c0.damage.total > this.lastDmg + 0.05) { this.lastDmg = c0.damage.total; this.bus.emit({ t: 'damage', car: 0, total: c0.damage.total }) }
    if (this.events.lap) this.bus.emit({ t: 'lap', car: 0, ...this.events.lap })
    if (this.events.sector) this.bus.emit({ t: 'sector', car: 0, n: this.events.sector })
    if (this.events.invalid) this.bus.emit({ t: 'invalid', car: 0, warnings: ses.warnings })
    this.alpha = Math.min(1, this.acc / DT)
    // voiture retournée ou immobilisée hors piste plus de 3 s → remise en piste automatique
    const c = this.car
    if (c.flipped > 1 || (c.offTrack && c.speed < 1 && this.ctl.throttle > 0.5)) this.stuckT += realDt; else this.stuckT = 0
    if (this.stuckT > 3) { this.stuckT = 0; this.resetCar() }
    this.steerVis += ((this.autopilot ? 0 : this.ctl.steer) - this.steerVis) * Math.min(1, realDt * 20)
  }
  /** Voie des stands : entrée/sortie, limiteur forcé dans la zone, pénalité si > 80 km/h plus de 0,5 s
   *  (après 2 s de tolérance pour freiner à la ligne). */
  private updatePit(dt: number) {
    if (!this.pit) return
    const c = this.car, z = this.pit.inLimitZone(c.pos[0], c.pos[2])
    if (z && !this.inPit) { this.inPit = true; this.pitSpeedT = -2; this.pitPenalised = false; this.events.pitEntry = true; this.bus.emit({ t: 'pitEntry', car: 0 }) }
    else if (!z && this.inPit) { this.inPit = false; this.events.pitExit = true; this.bus.emit({ t: 'pitExit', car: 0 }) }
    if (this.inPit) {
      // réparation UNIQUEMENT à l'arrêt dans la voie des stands (2 s immobile) : une voiture cassée ne se répare jamais seule
      this.pitStopT = c.speed < 0.6 ? this.pitStopT + dt : 0
      if (this.pitStopT > 2 && !this.pitServed) { this.pitServed = true; const dmg = c.damage.total > 0 || c.wheels.some(w => w.tyre.puncture > 0)
        c.repair(); c.fitTyres(); this.lastDmg = 0 // arrêt : pièces réparées + train de pneus neufs
        if (dmg) { this.events.repair = true; this.bus.emit({ t: 'repair', car: 0 }) } }
      if (c.speed > 2) this.pitServed = false
      const kmh = c.speed * 3.6
      this.pitSpeedT = kmh > 80.5 ? this.pitSpeedT + dt : Math.min(this.pitSpeedT + dt, 0)
      if (this.pitSpeedT > 0.5 && !this.pitPenalised) {
        this.pitPenalised = true; this.penalties += 5; this.events.pitSpeeding = Math.round(kmh)
        this.bus.emit({ t: 'pitSpeeding', car: 0, kmh, penalty: 5 })
        if (this.session.kind === 'timetrial') this.session.timing.invalidate()
      }
    }
  }
  setWeather(w: Weather) { this.env.setWeather(w) }
  /** débris : balistique simple + rebonds sur la surface de la piste ; restent au sol jusqu'au redémarrage. Une roue qui
   *  roule dessus à plus de 70 km/h peut crever (E : 30 %) et le débris est projeté. */
  private updateDebris(dt: number) {
    const c = this.car
    for (const d of c.debris.splice(0)) this.debris.push({ ...d, rest: false, rot: [0, 0, 0], spin: [(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20] })
    if (this.debris.length > 40) this.debris.splice(0, this.debris.length - 40)
    const smp = { h: 0, nx: 0, ny: 1, nz: 0, type: 1, s: 0, d: 0, i: c.hint }
    for (const d of this.debris) {
      if (!d.rest) {
        d.vel[1] -= 9.81 * dt
        for (let k = 0; k < 3; k++) { d.pos[k] += d.vel[k] * dt; d.rot[k] += d.spin[k] * dt }
        const g = this.track.sample(d.pos[0], d.pos[2], c.hint, smp)
        if (d.pos[1] < g.h + 0.03) { d.pos[1] = g.h + 0.03; d.vel[1] = Math.abs(d.vel[1]) * 0.3
          const f = g.type >= 4 ? 0.5 : 0.8; d.vel[0] *= f; d.vel[2] *= f; for (let k = 0; k < 3; k++) d.spin[k] *= 0.6
          if (Math.hypot(d.vel[0], d.vel[1], d.vel[2]) < 0.6) { d.rest = true; d.vel = [0, 0, 0] } }
      }
      if (c.speed > 19) for (const w of c.wheels) {
        if (!w.contact || Math.hypot(w.px - d.pos[0], w.pz - d.pos[2]) > 0.35) continue
        if (c.damageMode === 'real' && w.tyre.puncture === 0 && Math.random() < 0.3) w.tyre.puncture = 0.02
        d.rest = false; d.vel = [c.vel[0] * 0.6 + (Math.random() - 0.5) * 4, 2.5, c.vel[2] * 0.6 + (Math.random() - 0.5) * 4]
      }
    }
  }
  /** Pose interpolée (position du CG + quaternion) pour le rendu. */
  pose(out: Pose): Pose {
    const a = this.alpha, c = this.car, p = this.prev
    for (let k = 0; k < 3; k++) out.pos[k] = p.pos[k] + (c.pos[k] - p.pos[k]) * a
    // nlerp suffisant à 240 Hz
    let d = p.q[0] * c.q[0] + p.q[1] * c.q[1] + p.q[2] * c.q[2] + p.q[3] * c.q[3]
    const sgn = d < 0 ? -1 : 1
    let l = 0
    for (let k = 0; k < 4; k++) { out.q[k] = p.q[k] * (1 - a) + c.q[k] * a * sgn; l += out.q[k] * out.q[k] }
    l = Math.sqrt(l); for (let k = 0; k < 4; k++) out.q[k] /= l
    d = 0
    return out
  }
}
