/** Boucle de simulation : pas fixe 240 Hz découplé de l'affichage, état précédent/courant pour interpolation,
 *  session (chrono, DRS, limites de piste), remise en piste, meilleur tour persistant (localStorage). */
import { Vehicle, type Controls } from '../physics/vehicle.ts'
import { TrackEnv, type Weather } from '../physics/env.ts'
import { TrackSurface } from '../track/surface.ts'
import { buildRacingLine, type RacingLine } from '../track/racingLine.ts'
import { Autopilot } from '../physics/autopilot.ts'
import { Session, type SessionKind, type Flag } from './session.ts'
import { CIRCUIT } from './circuit.ts'
import { EventBus } from './events.ts'
import type { Pitlane, PitAnchors } from '../track/pitlane.ts'
import { RaceSim } from '../race/sim.ts'
import { PIT_CREW } from '../race/data.ts'
import type { SurfaceSample } from '../track/surface.ts'

export const DT = 1 / 240
const MAX_STEPS = 12 // au-delà : ralenti plutôt que spirale de la mort

export interface Pose { pos: number[]; q: number[] }
/** garage du joueur (monde) : repère de façade (x, y, z, yaw), place de la voiture 1, case d'arrêt, sens de la voie (x, z), caméra intérieure */
export interface GarageSpot { x: number; y: number; z: number; yaw: number; park: number[]; stop: number[]; lane: number[]; cam: number[] }
export interface GameEvents { lap?: { time: number; valid: boolean; best: boolean }; sector?: number; invalid?: boolean; reset?: boolean; pitEntry?: boolean; pitExit?: boolean; pitSpeeding?: number; repair?: boolean; pitStop?: boolean; garageOut?: boolean }

export class Game {
  track: TrackSurface; line: RacingLine; car: Vehicle; session: Session
  auto: Autopilot; autopilot = false
  prev: Pose = { pos: [0, 0, 0], q: [0, 0, 0, 1] }
  prevWheels: { c: number; angle: number; steer: number }[] = []
  acc = 0; time = 0; alpha = 0; paused = false
  ctl: Controls = { throttle: 0, brake: 0, steer: 0 }
  steerVis = 0
  events: GameEvents = {}
  bestKey = `w11.best.${CIRCUIT.id}`
  storedBest: number | null = null
  private stuckT = 0
  shifts = 0; maxScrape = 0; maxImpact = 0
  /** bus d'événements de course (radio, HUD, volant ; plus tard tout le plateau) */
  bus = new EventBus()
  /** voie des stands (limiteur automatique 80 km/h, pénalité d'excès de vitesse) */
  pit: Pitlane | null = null; pitServed = false; inPit = false; pitSpeedT = 0; pitStopT = 0; pitPenalised = false; penalties = 0
  /** immobilisation au stand (pénalité purgée) : freins serrés */
  holdT = 0
  private lastFlag = ''; private lastDmg = 0
  /** état de piste / météo partagé (physique, rendu, audio) */
  env: TrackEnv; private envAcc = 0
  /** débris physiques restés sur la piste (pièces arrachées) : position, vitesse, au repos ou non */
  debris: { part: string; pos: number[]; vel: number[]; rest: boolean; rot: number[]; spin: number[] }[] = []
  /** lot 8 C : plateau de 19 IA + direction de course (null en contre-la-montre / démo) */
  field: RaceSim | null = null
  /** cric procédural (pas une vidéo) : hauteur de caisse pendant l'arrêt */
  pitShow = { lift: 0 }
  /** course terminée pour le joueur : id de la voiture suivie, ou 'tv' */
  spectate: string | null = null
  spectateT = 0
  spectateHide = false
  /** a franchi la ligne d'entrée et pas encore la ligne de sortie */
  pitCommit = false
  private pitMark = 0
  private pitNear = false
  /** ancres Ty (pit_entry, pit_speed_*, pit_exit, pitlane_path). Sans rien d'exploitable, le pitlane.json reste en place. */
  adoptPitAnchors(a: PitAnchors) {
    const path = a.pitlane_path
    const useful = !!(a.pit_entry || a.pit_speed_start || a.pit_speed_end || a.pit_exit || a.pit_exit_light || (path && path.x.length > 4))
    if (!this.pit || !useful) return false
    const scratch: SurfaceSample = { h: 0, nx: 0, ny: 1, nz: 0, type: 0, s: 0, d: 0, i: 0 }
    let hint = -1
    this.pit.applyAnchors(a, (x, z) => {
      this.track.sample(x, z, hint, scratch)
      hint = scratch.i
      return { s: scratch.s, d: scratch.d }
    })
    this.field?.rebindPit()
    return true
  }
  /** garage du joueur, posé par pitYard (null : pas de garage 3D) ; sortie du garage = déplacement guidé jusqu'à la case d'arrêt */
  garage: GarageSpot | null = null
  garageExit: { pts: number[][]; cum: number[]; len: number; s: number; v: number; i: number } | null = null
  private gLocal(g: GarageSpot, p: number[]): [number, number] { const sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), dx = p[0] - g.x, dz = p[2] - g.z; return [dx * cs - dz * sn, dx * sn + dz * cs] }
  private gWorld(g: GarageSpot, lx: number, lz: number): [number, number] { const sn = Math.sin(g.yaw), cs = Math.cos(g.yaw); return [g.x + lx * cs + lz * sn, g.z - lx * sn + lz * cs] }
  /** pose la voiture dans son garage, nez vers la voie des stands */
  parkInGarage() {
    const g = this.garage; if (!g) return false
    this.garageExit = null
    this.car.placeAtXZ(g.park[0], g.park[2], Math.sin(g.yaw), Math.cos(g.yaw), 0)
    this.car.speed = 0; this.car.rpmVis = 4000
    this.snapshot()
    return true
  }
  /** la voiture sort du garage toute seule (tout droit, virage vers le sens de la voie) et le joueur reprend la main sur la case d'arrêt */
  beginGarageExit() {
    const g = this.garage; if (!g || !this.parkInGarage()) return false
    const [px, pz] = this.gLocal(g, g.park), [sx, sz] = this.gLocal(g, g.stop)
    const ldx = (g.lane[0] * Math.cos(g.yaw) - g.lane[1] * Math.sin(g.yaw)) >= 0 ? 1 : -1
    const R = Math.max(2.8, Math.min(4.5, sz - 1.4)), z0 = sz - R
    const loc: number[][] = []
    for (let z = pz; z < z0; z += 0.5) loc.push([px, z, 0, 1])
    for (let a = 0; a <= 20; a++) { const th = a / 20 * Math.PI / 2; loc.push([px + ldx * R * (1 - Math.cos(th)), z0 + R * Math.sin(th), ldx * Math.sin(th), Math.cos(th)]) }
    for (let x = px + ldx * R + ldx * 0.5; (sx - x) * ldx > 0; x += ldx * 0.5) loc.push([x, sz, ldx, 0])
    const sn = Math.sin(g.yaw), cs = Math.cos(g.yaw)
    const pts = loc.map(p => { const w = this.gWorld(g, p[0], p[1]); return [w[0], w[1], p[2] * cs + p[3] * sn, -p[2] * sn + p[3] * cs] })
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    this.garageExit = { pts, cum, len: cum[cum.length - 1], s: 0, v: 0.4, i: 0 }
    this.pitCommit = false; this.pitServed = false; this.holdT = 0; this.pitStopT = 0; this.pitShow.lift = 0; this.inPit = false
    return true
  }
  private stepGarageExit() {
    const E = this.garageExit!, c = this.car
    E.v = Math.min(6.5, Math.max(0.4, Math.sqrt(2 * 2.4 * E.s)))
    E.s += E.v * DT
    if (E.s >= E.len) {
      const l = E.pts[E.pts.length - 1]
      c.placeAtXZ(l[0], l[1], l[2], l[3], E.v); c.speed = E.v
      this.garageExit = null; this.events.garageOut = true
      if (this.pit) { const q = this.pit.probe(l[0], l[1]); this.pitCommit = true; this.pitNear = true; this.pitMark = q.p }
      return
    }
    while (E.i < E.pts.length - 2 && E.cum[E.i + 1] <= E.s) E.i++
    const a = E.pts[E.i], b = E.pts[E.i + 1], t = (E.s - E.cum[E.i]) / Math.max(1e-6, E.cum[E.i + 1] - E.cum[E.i])
    let hx = a[2] + (b[2] - a[2]) * t, hz = a[3] + (b[3] - a[3]) * t; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl
    c.placeAtXZ(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, hx, hz, E.v)
    c.speed = E.v
    for (const w of c.wheels) w.angle += w.omega * DT
  }
  /** météo vers laquelle le film d'eau converge (carrière, averse) ; null = figée */
  weatherTarget: Weather | null = null
  startField(o: { kind: SessionKind; laps: number; player: string; grid?: string[]; sessionLen?: number; seed?: number; posts?: unknown; exclude?: string[] }) {
    const F = new RaceSim({ track: this.track, line: this.line, pit: this.pit, kind: o.kind, laps: o.laps, player: o.player, grid: o.grid, sessionLen: o.sessionLen, seed: o.seed, exclude: o.exclude })
    F.vehicle = this.car; F.wetness = () => this.env.wetness
    if (o.posts) F.ctrl.buildPosts(o.posts as Parameters<typeof F.ctrl.buildPosts>[0])
    if (o.kind === 'race') { const g = F.gridPos(F.player.slot); this.car.placeAt(g.s, g.d, 0); this.car.fuel = F.player.fuel; this.snapshot() }
    this.field = F
    return F
  }
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
    this.sessionId++; this.garageExit = null
    this.session = new Session(this.track.length, kind)
    const L = this.track.length
    if (kind === 'timetrial') { const s0 = L - 200; this.car.placeAt(s0, this.lineOffset(s0), 55) }
    // course : pole position, sur la grille (E : ~25 m avant la ligne, côté gauche à Spa), à l'arrêt
    else if (kind === 'race') this.car.placeAt(L - 25, -2.2, 0)
    else this.car.placeAt(L - 120, this.lineOffset(L - 120), 0)
    this.car.ers.soc = 4.0e6
    this.car.fuel = 12; this.car.repair(); this.car.fitTyres(); this.lastDmg = 0; this.debris = []
    // piste de la session : contre-la-montre = piste déjà gommée (fin de qualif), essais = piste plus verte qui évolue
    this.env?.setEvolution(kind === 'timetrial' || kind === 'race' ? 0.75 : kind === 'qualifying' ? 0.6 : 0.35); this.env?.setWeather(this.env.weather)
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
      if (this.garageExit) { this.stepGarageExit(); this.time += DT; this.acc -= DT; n++; continue }
      const ctl = this.autopilot ? this.auto.control(this.car) : this.ctl
      if (this.inPit) ctl.pitLim = true
      ctl.noReverse = false
      if (this.holdT > 0 && this.inPit && this.pitStopT > 0) { ctl.throttle = 0; ctl.brake = 1; ctl.noReverse = true }
      if (this.field && (this.field.ctrl.phase === 'lights' || this.field.ctrl.phase === 'gridding') && !this.autopilot && this.car.speed < 3) { ctl.throttle = Math.min(ctl.throttle, 0.25); ctl.brake = Math.max(ctl.brake, this.field.ctrl.phase === 'lights' ? 1 : 0); ctl.noReverse = true }
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
    if (this.field && n > 0) {
      const F = this.field, C = F.ctrl
      F.update(n * DT)
      // DRS : règle 2020 (course : < 1 s au point de détection, à partir du 3e tour ; jamais sous SC / VSC / drapeau rouge / pluie)
      if (this.car.drsAvailable) this.car.drsAvailable = C.drsGlobal() && (this.session.kind !== 'race' || (F.player.drs && C.phase === 'racing'))
      const f = C.playerFlag() as Flag | ''
      if (f) { if (this.session.flag !== f) this.session.setFlag(f, 1.2); else this.session.setFlag(f, 1.2) }
    }
    // piste / météo à 10 Hz ; débris
    this.envAcc += Math.min(realDt, 0.1)
    if (this.envAcc >= 0.1) {
      if (this.weatherTarget && this.weatherTarget !== this.env.weather) this.env.approach(this.weatherTarget, 0.08)
      else if (this.weatherTarget) this.env.approach(this.weatherTarget, 0.04)
      this.env.update(this.envAcc, this.session.timing.best?.time ?? 106); this.envAcc = 0
    }
    this.updateDebris(Math.min(realDt, 0.05))
    if (!this.garageExit) this.updatePit(realDt)
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
    if (this.spectate) { this.spectateT += realDt; if (this.spectateT > 14) this.spectateHide = true; this.stuckT = 0 }
    else if (this.garageExit) this.stuckT = 0
    else if (this.raceOver()) this.enterSpectate()
    else if (c.flipped > 1 || (c.offTrack && c.speed < 1 && this.ctl.throttle > 0.5)) this.stuckT += realDt
    else this.stuckT = 0
    if (this.stuckT > 3 && !this.spectate) { this.stuckT = 0; this.resetCar() }
    this.steerVis += ((this.autopilot ? 0 : this.ctl.steer) - this.steerVis) * Math.min(1, realDt * 20)
  }
  /** Voie des stands : entrée/sortie, limiteur forcé dans la zone, pénalité si > 80 km/h plus de 0,5 s
   *  (après 2 s de tolérance pour freiner à la ligne). */
  private updatePit(dt: number) {
    if (!this.pit) return
    const c = this.car
    const q = this.pit.probe(c.pos[0], c.pos[2])
    const P = this.pit
    const entryP = P.cum[P.iEntry], exitP = P.cum[P.iExit]
    const near = q.dist < 7 && q.p >= entryP - 4 && q.p <= exitP + 6
    const limited = this.pit.inSpeedZone(c.pos[0], c.pos[2])
    if (near) {
      if (!this.pitNear) this.pitMark = q.p
      this.pitNear = true
      if (!this.pitCommit && q.p >= entryP && q.p < exitP - 1) {
        this.pitCommit = true; this.events.pitEntry = true; this.bus.emit({ t: 'pitEntry', car: 0 }); this.field?.ctrl.pitEvent(this.field.player, 'in')
      }
      if (this.pitCommit && this.pitMark < exitP && q.p >= exitP) {
        if (this.field && !this.field.ctrl.pitExitGreen()) this.field.ctrl.pitLine(this.field.player, 'sortie')
        this.events.pitExit = true; this.bus.emit({ t: 'pitExit', car: 0 }); this.pitCommit = false
      }
      this.pitMark = q.p
    } else {
      this.pitNear = false
      if (this.pitCommit && q.dist > 8 && this.pitMark < exitP - 8) {
        this.field?.ctrl.pitLine(this.field.player, 'sortie'); this.pitCommit = false
      }
    }
    const was = this.inPit
    this.inPit = limited
    if (limited && !was) { this.pitSpeedT = -2; this.pitPenalised = false }
    if (this.inPit || (this.pitCommit && near)) {
      const boxP = this.field ? this.field.boxOf(this.field.player.team) : NaN
      const atBox = Number.isFinite(boxP) && Math.abs(q.p - boxP) < 3.4 && q.lane === 'work'
      this.pitStopT = atBox && c.speed < 0.6 ? this.pitStopT + dt : (this.field ? 0 : (c.speed < 0.6 && this.inPit ? this.pitStopT + dt : 0))
      const crew = PIT_CREW[this.field?.player.team ?? 'mercedes'] ?? 2.6
      const u = crew > 0 ? this.pitStopT / (crew + Math.max(0, this.holdT)) : 0
      this.pitShow.lift = u > 0.12 && u < 0.88 ? 0.085 : 0
      if (this.field) { const ph = u < 0.12 ? 'stop' : u < 0.28 ? 'jack' : u < 0.4 ? 'guns' : u < 0.62 ? 'off' : u < 0.84 ? 'on' : u < 0.94 ? 'drop' : 'go'; this.field.player.pitPhase = this.pitStopT > 0.15 ? ph : '' }
      if (this.pitStopT > 0.4 && !this.pitServed && this.field) { const p = this.field.player, C = this.field.ctrl
        const hold = p.pen + (p.sgPend > 0 ? 10 : 0)
        if (hold > 0 && this.session.kind === 'race') { this.holdT = hold; C.msg(`${p.code} purge ${p.sgPend > 0 ? 'son stop-and-go' : 'sa pénalité de ' + p.pen + ' s'}`, 'pen'); p.penServed += p.pen; p.pen = 0; if (p.sgPend > 0) p.sgPend-- } }
      if (this.pitStopT > crew + this.holdT && !this.pitServed) { this.pitServed = true; this.holdT = 0; this.pitShow.lift = 0; if (this.field) { this.field.player.pitPhase = 'go'; this.field.ctrl.boxLight = 'green'; this.field.ctrl.release(this.field.player) } const dmg = c.damage.total > 0 || c.wheels.some(w => w.tyre.puncture > 0)
        this.events.pitStop = true; c.repair(); c.fitTyres(); this.lastDmg = 0
        if (dmg) { this.events.repair = true; this.bus.emit({ t: 'repair', car: 0 }) } }
      if (c.speed > 2) this.pitServed = false
      if (limited) {
        const kmh = c.speed * 3.6
        this.pitSpeedT = kmh > 80.5 ? this.pitSpeedT + dt : Math.min(this.pitSpeedT + dt, 0)
        if (this.pitSpeedT > 0.5 && !this.pitPenalised) {
          this.pitPenalised = true; this.events.pitSpeeding = Math.round(kmh)
          this.bus.emit({ t: 'pitSpeeding', car: 0, kmh, penalty: 5 })
          if (this.field) this.field.ctrl.pitSpeeding(this.field.player, c.speed)
          else { this.penalties += 5; if (this.session.kind === 'timetrial') this.session.timing.invalidate() }
        }
      }
    } else { this.pitShow.lift = 0; if (this.field && this.field.player.pitPhase) this.field.player.pitPhase = '' }
  }
  /** la voiture ne peut plus rentrer : la course du joueur s'arrête, sans respawn */
  private raceOver() {
    if (!this.field || this.session.kind !== 'race' || this.field.ctrl.phase === 'formation' || this.field.ctrl.phase === 'lights') return false
    const c = this.car
    const wheels = c.damage.wheelOff.filter(Boolean).length
    const dead = c.damage.floor > 0.8 || c.damage.suspension.some(s => s > 0.85) || wheels >= 2 || (c.flipped > 1.15 && c.damage.total > 0.45)
    return dead && c.speed < 4 && !this.inPit
  }
  private enterSpectate() {
    const F = this.field; if (!F) return
    const nxt = F.ordered().find(r => !r.player && !r.out)
    this.spectate = nxt?.id ?? 'tv'
    this.spectateT = 0
    const p = F.player
    if (!p.out) { p.out = 'Accident'; p.mode = 'dnf'; p.v = 0; F.ctrl.incident(p, p.s, 'crash'); F.ctrl.msg(`${p.code} : voiture immobilisée, course terminée. Les commissaires interviennent.`, 'rc') }
    this.bus.emit({ t: 'spectate', car: 0 })
  }
  setWeather(w: Weather) { this.env.setWeather(w); this.weatherTarget = null }
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
