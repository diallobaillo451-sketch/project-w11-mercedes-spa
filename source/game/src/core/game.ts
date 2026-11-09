/** Boucle de simulation : pas fixe 240 Hz découplé de l'affichage, état précédent/courant pour interpolation,
 *  session (chrono, DRS, limites de piste), remise en piste, meilleur tour persistant (localStorage). */
import { Vehicle, type Controls } from '../physics/vehicle.ts'
import { TrackSurface } from '../track/surface.ts'
import { buildRacingLine, type RacingLine } from '../track/racingLine.ts'
import { Autopilot } from '../physics/autopilot.ts'
import { Session, type SessionKind } from './session.ts'

export const DT = 1 / 240
const MAX_STEPS = 12 // au-delà : ralenti plutôt que spirale de la mort

export interface Pose { pos: number[]; q: number[] }
export interface GameEvents { lap?: { time: number; valid: boolean; best: boolean }; sector?: number; invalid?: boolean; reset?: boolean }

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
  constructor(track: TrackSurface, kind: SessionKind = 'timetrial') {
    this.track = track
    this.line = buildRacingLine(track, 1600, 1.0)
    this.car = new Vehicle(track)
    this.auto = new Autopilot(this.line, 1.06) // E : marge pilote calée (après muX 0,67) → tour ≈ 1:41,75 (pole réelle 1:41,252)
    this.session = new Session(track.length, kind)
    try { const b = localStorage.getItem(this.bestKey); this.storedBest = b ? Number(b) : null } catch { this.storedBest = null }
    this.start(kind)
  }
  /** Départ lancé (contre-la-montre : tour de sortie court avant la ligne) ou arrêté aux stands. */
  start(kind: SessionKind = this.session.kind) {
    this.session = new Session(this.track.length, kind)
    const L = this.track.length
    if (kind === 'timetrial') { const s0 = L - 200; this.car.placeAt(s0, this.lineOffset(s0), 55) }
    else this.car.placeAt(L - 120, this.lineOffset(L - 120), 0)
    this.car.ers.soc = 4.0e6
    this.snapshot(); this.acc = 0
  }
  lineOffset(s: number) { const i = Math.floor(((s % this.track.length) + this.track.length) % this.track.length / this.line.ds) % this.line.N; return this.line.e[i] }
  /** Remise en piste à l'abscisse courante, sur la trajectoire, à vitesse réduite. */
  resetCar() {
    const s = this.car.s
    this.car.placeAt(s, this.lineOffset(s), 8)
    this.session.timing.invalidate(); this.events.reset = true
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
    this.alpha = Math.min(1, this.acc / DT)
    // voiture retournée ou immobilisée hors piste plus de 3 s → remise en piste automatique
    const c = this.car
    if (c.flipped > 1 || (c.offTrack && c.speed < 1 && this.ctl.throttle > 0.5)) this.stuckT += realDt; else this.stuckT = 0
    if (this.stuckT > 3) { this.stuckT = 0; this.resetCar() }
    this.steerVis += ((this.autopilot ? 0 : this.ctl.steer) - this.steerVis) * Math.min(1, realDt * 20)
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
