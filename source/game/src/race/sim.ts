/** Lot 8 C — plateau IA 2020 (19 adversaires + le joueur) : simulation « espace piste » (abscisse s, écart latéral d,
 *  vitesse v) à 60 Hz. Chaque adversaire suit un profil de vitesse calculé avec la physique 2020 de SON équipe
 *  (cars2020.ts : moteur, appui, traînée ; DRS ouvert dans les zones) puis calé sur les vrais temps de Spa 2020, et
 *  applique : rythme pilote, pneus (gomme, usure, température), carburant, dégâts, aspiration / air sale, DRS (< 1 s à
 *  la détection, dès le 3e tour), attaque / défense, drapeaux bleus, trafic en essais / qualif, stratégie et arrêts aux
 *  stands par la vraie voie des stands, erreurs RARES et liées à la situation (pluie, pneus froids, pression, trafic),
 *  contacts (avec dégâts) entre IA et avec la voiture du joueur (physique complète, Vehicle.carHit).
 *  Les règles, drapeaux, safety car, VSC, drapeau rouge, commissaires et pénalités sont dans control.ts.
 *  Choix assumé (E) : les IA ne font pas tourner le modèle de pneus/suspension complet du joueur (19 × 240 Hz serait
 *  trop lourd pour l'iPhone) ; leur dynamique est longitudinale + latérale dans le repère de la piste. */
import type { TrackSurface } from '../track/surface.ts'
import { type RacingLine, speedProfile, profileLapTime } from '../track/racingLine.ts'
import { CARS2020, applyCarPhysics, currentCar } from '../physics/cars2020.ts'
import { W11 } from '../physics/params.ts'
import { icePower } from '../physics/powertrain.ts'
import { DRIVERS, carOfTeam } from '../data/drivers.ts'
import type { Pitlane } from '../track/pitlane.ts'
import type { Vehicle } from '../physics/vehicle.ts'
import { drsZones, type SessionKind } from '../core/session.ts'
import { SPA_Q, POLE_2020, SKILL, PIT_CREW, RELIAB, GARAGE_ORDER, TYRE, type Comp, type Skill } from './data.ts'
import { RaceControl } from './control.ts'
import { HybridBank, type DriveCmd } from './hybrid.ts'

export class Rng {
  s: number
  constructor(seed: number) { this.s = seed >>> 0 || 1 }
  next() { let t = (this.s = (this.s + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  gauss() { const u = Math.max(1e-9, this.next()), v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
  pick<T>(a: T[]) { return a[Math.floor(this.next() * a.length)] }
}
export type AiMode = 'garage' | 'grid' | 'formation' | 'race' | 'out' | 'push' | 'cool' | 'in' | 'pit' | 'spun' | 'dnf' | 'redq' | 'sc'
export interface TeamProf { v: Float64Array; vD: Float64Array; T: number; mu: number; aMax: number }
export interface Racer {
  i: number; id: string; code: string; num: number; team: string; car: string; player: boolean; sk: Skill
  dist: number; s: number; d: number; v: number; lat: number; idx: number; lastS: number
  laps: number; lapT0: number; secT0: number; sector: number; sectors: number[]; last: number; best: number; lapValid: boolean
  lapTimes: number[]; bestBy: Record<string, number>
  tyre: { c: Comp; age: number; temp: number; flat: number; punct: number; used: Comp[] }; fuel: number
  dmg: { fw: number; rw: number; floor: number }
  mode: AiMode; prevMode: AiMode; out: string | null
  kq: number; prof: TeamProf
  off: number | null; side: number; attackT: number; defMoved: boolean; yieldT: number; weave: number
  err: { kind: string; t: number } | null; stopT: number
  drs: boolean; drsArmed: number
  pitP: number; pitT: number; pitWhy: string; wantPit: string | null; plan: { lap: number; c: Comp }[]; boxP: number; stops: number
  pen: number; dtPend: number; sgPend: number; penServed: number; warnings: number; bw: boolean; gridPen: number
  gap: number; int: number; pos: number; finished: boolean; finishT: number; blueT: number; slot: number
  runs: number[]; runIdx: number; pushLeft: number
  wx: number; wy: number; wz: number; hx: number; hz: number; nx: number; ny: number; nz: number; steer: number; spin: number
  /** orientation du corps rigide (physique hybride) ; null = pose piste + couche visuelle */
  q: number[] | null
  pitPhase: string; sepT: number; pitLat: number
  inPit: boolean
}
export interface Msg { t: number; text: string; kind: 'rc' | 'info' | 'pen' | 'flag' | 'team' }
const CL = 5.6 // longueur d'une F1 2020 (m)
const CW = 1.9 // largeur + marge (m)
export const PIT_LIMIT = 80 / 3.6
/** facteur de puissance effective par équipe (C : calé sur l'I1 de Spa 2020, voir tests/race_sim.test.ts CALPOW=1) */
export const AI_POW: Record<string, number> = {}
const CALIB_POW = true

export class RaceSim {
  track: TrackSurface; line: RacingLine; L: number; N: number; ds: number
  kind: SessionKind; circuit: string; laps: number; rng: Rng
  cars: Racer[] = []; player: Racer; t = 0; started = false
  pit: Pitlane | null; pitCum: Float32Array | null = null; pitLen = 0; pitEntryS = 0
  zones: [number, number][]; drsDet: number[]
  crit: Float32Array; critSum = 0
  ctrl: RaceControl
  profs = new Map<string, TeamProf>()
  leaderT: Float64Array; binW = 25
  msgs: Msg[] = []; onMsg: ((m: Msg) => void) | null = null
  vehicle: Vehicle | null = null
  /** 0–100. 85 = rythme de référence (Spa 2020). Plus bas : IA plus lentes, plus d'erreurs, stratégie moins agressive. */
  difficulty = 85
  /** les 3–4 IA autour du joueur passent sur Vehicle (activé par le jeu, pas par les tests) */
  hybridOn = false
  near = new Set<number>()
  cmd = new Map<number, DriveCmd>()
  private hybridBank: HybridBank | null = null
  wetness = () => 0
  sessionLen = 0; chequered = false; wearScale = 1
  playerOnHot = false
  constructor(o: { track: TrackSurface; line: RacingLine; pit: Pitlane | null; kind: SessionKind; circuit?: string; laps?: number; player: string; seed?: number; sessionLen?: number; grid?: string[]; playerAi?: boolean; exclude?: string[] }) {
    this.track = o.track; this.line = o.line; this.L = o.track.length; this.N = o.line.N; this.ds = o.track.ds
    this.kind = o.kind; this.circuit = o.circuit ?? 'bel'; this.laps = o.laps ?? 10; this.rng = new Rng(o.seed ?? (Date.now() & 0xffffff))
    this.pit = o.pit; this.sessionLen = o.sessionLen ?? 0
    this.wearScale = this.kind === 'race' ? Math.max(1, Math.min(4.4, 44 / Math.max(1, this.laps))) : 1
    this.zones = drsZones(this.L); this.drsDet = this.zones.filter(z => z[0] > 1).map(z => (z[0] - 120 + this.L) % this.L)
    this.leaderT = new Float64Array(Math.ceil((this.laps + 3) * this.L / this.binW) + 8).fill(NaN)
    this.buildProfiles()
    this.crit = this.buildCrit()
    if (this.pit) this.rebindPit()
    const order = o.grid ?? this.defaultOrder(o.player)
    const ids = [o.player, ...DRIVERS.map(d => d.id).filter(id => id !== o.player)]
    for (const id of ids) this.cars.push(this.makeRacer(id, id === o.player))
    this.player = this.cars[0]
    if (o.playerAi) this.player.player = false
    this.ctrl = new RaceControl(this)
    // grille (course) / garages (essais, qualif)
    order.forEach((id, k) => { const r = this.cars.find(c => c.id === id); if (r) r.slot = k })
    if (this.kind === 'race') for (const r of this.cars) this.placeOnGrid(r)
    else for (const r of this.cars) { if (!r.player) { r.mode = 'garage'; this.planRuns(r) } }
    // qualif : pilotes éliminés à la séance précédente (restent au garage, classés après)
    for (const id of o.exclude ?? []) { const r = this.cars.find(c => c.id === id && !c.player); if (r) { r.out = 'Éliminé'; r.mode = 'garage'; r.runs = [] } }
  }
  /** ordre par défaut : temps réels de Spa 2020 (pilote du joueur à sa place réelle) */
  defaultOrder(_p: string) { return Object.keys(SPA_Q).sort((a, b) => SPA_Q[a] - SPA_Q[b]) }
  private makeRacer(id: string, player: boolean): Racer {
    const d = DRIVERS.find(x => x.id === id)!, team = d.team, prof = this.profs.get(team)!
    const tq = this.targetQ(id), kq = Math.min(1.015, prof.T / tq * 1.0065) // C : compense la gomme qui vieillit et le suivi discret du profil
    const fuel = this.kind === 'race' ? Math.min(110, 2.45 * this.laps * this.L / 7004 + 2) : 30
    return { i: this.cars.length, id, code: id.toUpperCase(), num: d.num, team, car: carOfTeam(team), player, sk: SKILL[id] ?? SKILL.lat,
      dist: 0, s: 0, d: 0, v: 0, lat: 0, idx: 0, lastS: 0, laps: 0, lapT0: NaN, secT0: NaN, sector: 0, sectors: [], last: NaN, best: NaN, lapValid: true, lapTimes: [], bestBy: {},
      tyre: { c: this.kind === 'race' ? 'M' : 'S', age: 0, temp: 0.8, flat: 0, punct: 0, used: [] }, fuel,
      dmg: { fw: 0, rw: 0, floor: 0 }, mode: 'race', prevMode: 'race', out: null, kq, prof,
      off: null, side: 0, attackT: 0, defMoved: false, yieldT: 0, weave: this.rng.next() * 6, err: null, stopT: 0, drs: false, drsArmed: -1,
      pitP: 0, pitT: 0, pitWhy: '', wantPit: null, plan: [], boxP: 0, stops: 0,
      pen: 0, dtPend: 0, sgPend: 0, penServed: 0, warnings: 0, bw: false, gridPen: 0,
      gap: 0, int: 0, pos: 0, finished: false, finishT: 0, blueT: 0, slot: 0, runs: [], runIdx: 0, pushLeft: 0,
      wx: 0, wy: 0, wz: 0, hx: 0, hz: -1, nx: 0, ny: 1, nz: 0, steer: 0, spin: 0, q: null, pitPhase: '', sepT: 0, pitLat: 0, inPit: false }
  }
  /** temps de qualif visé (s) : réel Spa 2020 rapporté à la pole 2020 du circuit */
  targetQ(id: string) { const pole = POLE_2020[this.circuit] ?? 101.252; return pole * (SPA_Q[id] ?? 104) / SPA_Q.ham }
  /** profils de vitesse par équipe : physique 2020 de l'équipe (moteur, ClA, CdA), adhérence calée par dichotomie
   *  pour retrouver le meilleur temps réel de l'équipe (C). DRS : traînée × 0,84 dans les zones. */
  static profCache = new Map<string, Map<string, TeamProf>>()
  private buildProfiles() {
    const ck = this.circuit + ':' + this.N; const hit = RaceSim.profCache.get(ck); if (hit) { this.profs = hit; return }
    this.buildProfilesRaw(); RaceSim.profCache.set(ck, this.profs)
  }
  private buildProfilesRaw() {
    const keep = currentCar(), drs = new Uint8Array(this.N)
    for (const [a, b] of this.zones) for (let i = 0; i < this.N; i++) { const s = i * this.ds; if (s >= a && s <= b) drs[i] = 1 }
    for (const team of GARAGE_ORDER) {
      const id = carOfTeam(team), cp = CARS2020[id] ?? CARS2020.w11
      applyCarPhysics(id)
      let pk = AI_POW[team] ?? 1
      const P = { m: W11.massMin + 12, ClA: W11.ClA, CdA: W11.CdA, power: (v: number) => pk * (icePower(Math.min(12000, 9000 + v * 40), 1, 'quali') + W11.mgukPower * 0.9) }
      const tgt = (POLE_2020[this.circuit] ?? 101.252) * cp.spaQ / CARS2020.w11.spaQ
      // puissance « effective » calée (Spa) sur la vitesse réelle en fin de Kemmel (I1, DRS ouvert, qualif 2020)
      if (this.circuit === 'bel' && CALIB_POW) { const a = Math.floor(1380 / this.ds), b = Math.floor(2230 / this.ds); let lo = 0.5, hi = 1.2
        for (let k = 0; k < 14; k++) { pk = (lo + hi) / 2; const v = speedProfile(this.track, this.line, P, 1, drs); let m = 0; for (let i = a; i < b; i++) m = Math.max(m, v[i]); if (m * 3.6 > cp.spaI1) hi = pk; else lo = pk }
        AI_POW[team] = pk }
      let lo = 0.6, hi = 1.4, v = speedProfile(this.track, this.line, P, 1, drs)
      for (let k = 0; k < 16; k++) { const mu = (lo + hi) / 2; v = speedProfile(this.track, this.line, P, mu, drs); if (profileLapTime(v, this.ds) > tgt) lo = mu; else hi = mu }
      const mu = (lo + hi) / 2, vN = speedProfile(this.track, this.line, P, mu), vD = speedProfile(this.track, this.line, P, mu, drs)
      const aMax = 735000 * cp.ice / (W11.massMin + 60)
      this.profs.set(team, { v: vN, vD, T: profileLapTime(vD, this.ds), mu, aMax })
    }
    applyCarPhysics(keep)
  }
  /** points « critiques » (freinages, gros appuis) où se produisent les erreurs : poids ∝ décélération à venir */
  private buildCrit() {
    const v = this.profs.get('mercedes')!.v, N = this.N, c = new Float32Array(N), look = Math.round(60 / this.ds)
    for (let i = 0; i < N; i++) { const dv = v[i] - v[(i + look) % N]; c[i] = Math.max(0, dv - 4) / 30 + (v[i] < 40 ? 0.02 : 0) }
    let s = 0; for (let i = 0; i < N; i++) s += c[i]; this.critSum = s
    return c
  }
  idxOf(s: number) { const n = this.N; return ((Math.floor(s / this.ds) % n) + n) % n }
  wrapS(s: number) { return ((s % this.L) + this.L) % this.L }
  /** écart route (m) de a vers b, dans ]-L/2, L/2] */
  road(a: number, b: number) { let g = b - a; g -= Math.round(g / this.L) * this.L; return g }
  // ───────────── grille, garages, plans de séance
  gridPos(k: number) { return { s: this.wrapS(-12 - 8 * k), d: k % 2 === 0 ? -2.2 : 2.2 } }
  placeOnGrid(r: Racer) {
    const g = this.gridPos(r.slot); r.s = g.s; r.d = g.d; r.v = 0; r.dist = -this.road(g.s, 0); r.lastS = r.s; r.mode = r.player ? 'race' : 'grid'; r.idx = this.idxOf(r.s)
    r.dist = -(this.L - r.s) // derrière la ligne : distance négative
    this.pose(r)
  }
  /** essais / qualif : 1 à 3 relais (sortie, 1–2 tours rapides, retour), le dernier calé avant le drapeau */
  planRuns(r: Racer) {
    const len = this.sessionLen || 900, lap = this.targetQ(r.id) * 1.25
    r.runs = []
    if (this.kind === 'qualifying') {
      // 2 relais : un tôt (banker un temps), un dernier calé pour franchir la ligne juste avant le drapeau
      r.runs.push(4 + this.rng.next() * Math.min(90, len * 0.12))
      r.runs.push(Math.max(r.runs[0] + lap * 3, len - lap * 2.1 - this.rng.next() * 30))
    } else { const n = Math.max(1, Math.min(3, Math.floor(len / (lap * 5 + 90)))); for (let k = 0; k < n; k++) r.runs.push(len * (k + 0.1 + this.rng.next() * 0.4) / n) }
    r.runIdx = 0
  }
  // ───────────── pose monde (rendu, contacts avec le joueur)
  pose(r: Racer) {
    if (r.mode === 'pit' && this.pit && this.pitCum) { const P = this.pit, k = this.pitIdx(r.pitP), k1 = Math.min(P.n - 1, k + 1), f = Math.max(0, Math.min(1, (r.pitP - this.pitCum[k]) / Math.max(0.01, this.pitCum[k1] - this.pitCum[k])))
      r.wx = P.x[k] + (P.x[k1] - P.x[k]) * f; r.wz = P.z[k] + (P.z[k1] - P.z[k]) * f; const hx = P.x[k1] - P.x[k], hz = P.z[k1] - P.z[k], n = Math.hypot(hx, hz) || 1; r.hx = hx / n; r.hz = hz / n
      if (r.pitLat) { const c0 = this.track.centre(P.s[k]); const gx = r.wx - c0.x, gz = r.wz - c0.z, gl = Math.hypot(gx, gz) || 1; r.wx += gx / gl * r.pitLat; r.wz += gz / gl * r.pitLat } }
    else { const c = this.track.centre(r.s), rx = -c.tz, rz = c.tx; r.wx = c.x + rx * r.d; r.wz = c.z + rz * r.d
      const a = Math.atan2(r.lat, Math.max(3, r.v)), ca = Math.cos(a), sa = Math.sin(a); r.hx = c.tx * ca + rx * sa; r.hz = c.tz * ca + rz * sa
      if (r.mode === 'spun') { const sp = r.spin; r.hx = c.tx * Math.cos(sp) + rx * Math.sin(sp); r.hz = c.tz * Math.cos(sp) + rz * Math.sin(sp) } }
    const g = this.track.sample(r.wx, r.wz, r.idx, smp); r.wy = g.h; r.nx = g.nx; r.ny = g.ny; r.nz = g.nz
    if (Math.abs(g.d) < 60 && r.mode !== 'pit') r.idx = g.i
  }
  pitIdx(p: number) { const c = this.pitCum!; let lo = 0, hi = c.length - 1; while (lo < hi - 1) { const m = (lo + hi) >> 1; if (c[m] <= p) lo = m; else hi = m } return lo }
  /** après applyAnchors : recalcule les abscisses du chemin */
  rebindPit() {
    const P = this.pit; if (!P) return
    this.pitCum = P.cum
    this.pitLen = P.cum[P.n - 1]
    this.pitEntryS = P.s[P.iEntry] || P.s[0]
  }
  // ───────────── boucle
  update(dt: number) {
    let rest = Math.min(dt, 0.1)
    while (rest > 1e-6) { const h = Math.min(rest, 1 / 60); this.step(h); rest -= h }
  }
  /** avance rapide (garage, fin de séance) : pas fixes de 1/60 s */
  advance(sec: number) { const n = Math.round(sec * 60); for (let k = 0; k < n; k++) this.step(1 / 60) }
  step(dt: number) {
    this.t += dt
    if (this.vehicle) this.syncPlayer(this.vehicle)
    this.ctrl.update(dt)
    if (this.hybridOn && this.vehicle) { (this.hybridBank ??= new HybridBank(this)).pick(this, this.near) }
    else if (this.near.size) this.near.clear()
    for (const r of this.cars) if (!r.player) this.stepAi(r, dt)
    if (this.hybridBank && this.hybridOn) this.hybridBank.step(this, dt)
    this.contacts()
    this.hybridBank?.nudge(this)
    for (const r of this.cars) { this.timing(r); if (!r.player && !this.drives(r)) this.pose(r) }
    this.classify()
  }
  syncPlayer(c: Vehicle) {
    const r = this.player
    r.s = c.s; r.d = c.d; r.v = Math.max(0, c.forwardSpeed()); r.idx = c.trackIdx; r.wx = c.pos[0]; r.wy = c.pos[1]; r.wz = c.pos[2]
    const prevS = r.lastS
    r.dist += this.road(r.lastS, r.s); r.lastS = r.s
    // DRS du joueur : écart à la voiture devant mesuré au point de détection (course), libre en essais / qualif
    for (const det of this.drsDet) if (this.road(prevS, det) >= 0 && this.road(r.s, det) < 0) {
      let g = 1e9; for (const o of this.cars) { if (o === r || !this.onTrack(o)) continue; const d = this.road(r.s, o.s); if (d > 0 && d < g) g = d }
      r.drs = this.kind !== 'race' || this.ctrl.drsAllowed(r, g / Math.max(10, r.v)) }
    this.playerRules(r, c)
    r.dmg.fw = c.damage.frontWing; r.dmg.rw = c.damage.rearWing; r.dmg.floor = c.damage.floor
    r.tyre.c = (c.setup.compound === 'C4' ? 'S' : c.setup.compound === 'C3' || c.setup.compound === 'C1' ? 'M' : c.setup.compound === 'C2' ? 'H' : c.setup.compound) as Comp
    // voie des stands du joueur (même zone que l'IA) : pour la file, le trafic et le chronométrage
    r.inPit = !!this.pit && this.pit.inLimitZone(c.pos[0], c.pos[2])
    // aspiration pour la physique du joueur : voiture devant la plus proche (même voie)
    let best: { gap: number; lat: number } | null = null
    for (const o of this.cars) { if (o === r || !this.onTrack(o)) continue; const g = this.road(r.s, o.s); if (g > 0 && g < 120 && (!best || g < best.gap)) best = { gap: g - CL, lat: o.d - r.d } }
    c.lead = best
  }
  onTrack(r: Racer) { return r.mode !== 'garage' && r.mode !== 'pit' && r.mode !== 'dnf' && r.mode !== 'redq' && !(r.player && r.inPit) }
  // ───────────── IA
  private paceK(r: Racer) {
    const T = r.prof.T, ty = TYRE[r.tyre.c], age = r.tyre.age * this.wearScale
    let dl = ty.delta + ty.deg * age * (1.05 - r.sk.tyre * 0.1) + Math.max(0, age - ty.cliff) ** 2 * 0.02
    dl += (1 - r.tyre.temp) * 2.2 + r.tyre.flat * 0.6 + r.dmg.fw * 2.5 + r.dmg.rw * 1.8 + r.dmg.floor * 1.5 + (r.tyre.punct ? 20 : 0)
    const wet = this.wetness()
    if (wet > 0.15) { const slick = r.tyre.c === 'S' || r.tyre.c === 'M' || r.tyre.c === 'H'; dl += slick ? wet * 28 : r.tyre.c === 'W' && wet < 0.6 ? (0.6 - wet) * 10 : 0; dl += wet * (1.1 - r.sk.wet) * 8 - (r.tyre.c === 'I' || r.tyre.c === 'W' ? ty.delta * Math.min(1, wet * 1.6) : 0) }
    if (this.kind === 'race') dl += 2.0 + r.fuel * 0.035 * this.L / 7004 // mode moteur course + gestion pneus (≈2 s vs Q, Spa 2020 : tours de course 1:47,5–1:49 vs pole 1:41,25), carburant (E : 0,035 s/kg)
    const diff = 0.88 + 0.14 * (this.difficulty / 100)
    return r.kq * T / (T + dl) * diff
  }
  /** vraie physique (Vehicle) pour cette IA ce pas-ci */
  drives(r: Racer) {
    return this.hybridOn && this.near.has(r.i) && r.mode !== 'pit' && r.mode !== 'grid' && r.mode !== 'garage' && r.mode !== 'dnf' && r.mode !== 'spun' && r.mode !== 'redq'
  }
  private stepAi(r: Racer, dt: number) {
    const C = this.ctrl
    if (r.mode === 'garage') { this.garageLogic(r); return }
    if (r.mode === 'dnf' || r.mode === 'redq' || r.mode === 'grid') { r.v = 0; r.lat = 0; return }
    if (r.mode === 'pit') { this.stepPit(r, dt); return }
    const i = r.idx = this.idxOf(r.s), ln = this.line
    // ─ décision de rentrer
    if (r.wantPit && this.pit && this.road(r.s, this.pitEntryS) > 0 && this.road(r.s, this.pitEntryS) < r.v * dt + 0.5 && C.pitOpenFor(r)) { this.enterPit(r); return }
    // ─ vitesse cible
    const late = r.attackT > 0 ? Math.round((3 + r.sk.craft * 7) / this.ds) : 0
    const useD = r.drs && this.inZone(r.s)
    const P = useD ? r.prof.vD : r.prof.v
    const nx = Math.ceil(r.v / 60 / this.ds) + 1
    let vt = Math.min(P[(i + this.N - late) % this.N], P[(i + nx + this.N - late) % this.N]) * (this.paceKCache(r))
    const modeK = r.mode === 'out' ? 0.86 : r.mode === 'cool' ? 0.78 : r.mode === 'in' ? 0.8 : 1
    vt *= modeK
    if (r.mode === 'spun') vt = 0
    if (r.err) vt *= r.err.kind === 'lock' ? 0.94 : r.err.kind === 'wide' ? 0.9 : r.err.kind === 'mech' ? 0.55 : 1
    // ─ voisins : devant (même voie), à côté, derrière
    let ahead: Racer | null = null, gA = 1e9, behind: Racer | null = null, gB = 1e9
    for (const o of this.cars) {
      if (o === r || !this.onTrack(o)) continue
      const g = this.road(r.s, o.s)
      // « devant dans ma voie » : chevauchement latéral maintenant, ou sur la trajectoire que je vais reprendre
      const lane = Math.abs(o.d - r.d) < CW + 0.2 || (r.off === null && o.mode !== 'grid' && r.mode !== 'formation' && g > CL && Math.abs(o.d - ln.e[(i + Math.round(g / this.ds)) % this.N]) < CW + 0.1 && Math.abs(o.d - r.d) < 4.5)
      if (g > 0 && g < 160 && lane && g < gA) { gA = g; ahead = o }
      if (g < 0 && g > -120 && -g < gB) { gB = -g; behind = o }
    }
    // aspiration / air sale (E : +1,2 % en ligne droite à 10 m, −1,5 % en courbe)
    const k = Math.abs(ln.k[i])
    if (ahead && gA < 60) { if (k < 0.002) vt *= 1 + 0.012 * Math.exp(-gA / 25); else vt *= 1 - 0.015 * Math.exp(-gA / 20) }
    vt = C.speedCap(r, i, vt)
    if (C.vsc && r.mode === 'race') C.vscOver(r, r.v, r.prof.v[i] * 0.62, dt)
    // ─ suivre (pas de place à côté) : on ne rentre pas dans la voiture devant
    if (ahead) { const v0 = ahead.v, gmin = 2.5 + r.v * 0.09, gg = gA - CL; vt = Math.min(vt, Math.max(0, v0 + (gg - gmin) * 0.9)); if (gg < 1) vt = Math.min(vt, v0 - 2)
      // freinage d'urgence (le pilote voit la voiture devant ralentir) : jamais de rapprochement sous la marge
      if (gg < gmin * 0.6 && r.v > v0 && !r.err) r.v = Math.max(v0, r.v - 60 * dt) }
    // ─ tactique (attaque, défense, bleus, trafic) toutes les ~0,2 s
    this.tactics(r, ahead, gA, behind, gB, dt)
    // ─ intégration longitudinale
    const pa = P[i], pb = P[(i + nx) % this.N], aProf = Math.max(0, (pb * pb - pa * pa) / (2 * nx * this.ds))
    const aAcc = Math.max(aProf * 1.03, Math.min(r.v < 25 ? 11 : 14, r.prof.aMax * 0.8 / Math.max(8, r.v) - 0.0009 * r.v * r.v)) * (r.err?.kind === 'mech' ? 0.4 : 1)
    const aBrk = (30 + 0.006 * r.v * r.v) * (r.err?.kind === 'lock' ? 0.7 : 1) * (this.wetness() > 0.3 ? 0.75 : 1)
    const dv = vt - r.v
    const ghost = this.drives(r)
    if (!ghost) r.v = Math.max(0, r.v + Math.max(-aBrk * dt, Math.min(aAcc * dt, dv)))
    // ─ latéral : la trajectoire de course est suivie exactement (anticipation) ; seul l'ÉCART à la trajectoire
    //   (attaque, défense, céder le passage, sortie large, tour de formation) est dynamique et limité en vitesse
    const [eL, eR] = [this.track.wlR[i] - 0.9, this.track.wrR[i] - 0.9]
    const e0 = ln.e[i]
    let dT = r.off ?? e0
    if (r.mode === 'formation' || C.weave(r)) { if (k < 0.0025 && r.v > 12 && r.off === null) dT = e0 * 0.3 + Math.sin(this.t * 3.1 + r.weave) * 2.2 }
    if (r.err?.kind === 'wide') dT = r.side > 0 ? eR + 2.6 : -(eL + 2.6)
    if (r.mode === 'spun') dT = r.d
    if (!(r.err?.kind === 'wide') && r.mode !== 'spun') dT = Math.max(-eL, Math.min(eR, dT))
    // évitement : ne pas se rabattre sur une voiture qui est à côté
    for (const o of this.cars) { if (o === r || !this.onTrack(o)) continue; const g = this.road(r.s, o.s); if (Math.abs(g) > CL + 0.8) continue
      const sd = o.d - r.d; if (Math.abs(sd) < 3.2) { if (sd > 0 && dT > o.d - 2.15) dT = o.d - 2.15; if (sd <= 0 && dT < o.d + 2.15) dT = o.d + 2.15 } }
    const devT = dT - e0, dev0 = r.d - (this.lastE.get(r.i) ?? e0)
    const rate = 1.0 + 0.035 * r.v
    const dl = Math.max(-rate * dt, Math.min(rate * dt, (devT - dev0) * Math.min(1, dt * 2.5)))
    const nd = e0 + dev0 + dl
    const ndc = r.err?.kind === 'wide' || r.mode === 'spun' ? nd : Math.max(-(eL + 0.5), Math.min(eR + 0.5, nd))
    if (ghost) this.cmd.set(r.i, { vt, dT })
    else { r.lat = (ndc - r.d) / dt * 0.3 + r.lat * 0.7; r.d = ndc }
    ;(r as Racer & { _dr?: number })._dr = dl / dt
    // ─ avance (la physique hybride écrit s / d / v ensuite)
    const ds = r.v * dt
    if (!ghost) { r.s = this.wrapS(r.s + ds); r.dist += ds }
    this.lastE.set(r.i, ln.e[this.idxOf(r.s)])
    r.steer = Math.max(-1, Math.min(1, ln.k[i] * 9 + r.lat * 0.05)); r.spin += r.v * dt / 0.33
    // ─ pneus : chauffe (tour de sortie ≈ 1 tour pour atteindre la fenêtre), usure, carburant
    const ty = TYRE[r.tyre.c], warmRate = ty.warm * (0.5 + r.v / 80) / this.L * 1.4
    r.tyre.temp = Math.min(1, r.tyre.temp + ds * warmRate * (r.mode === 'formation' || r.mode === 'sc' ? 1.6 : 1)) - (r.v < 30 ? dt * 0.004 : 0)
    r.tyre.temp = Math.max(0.3, r.tyre.temp)
    r.tyre.age += ds / this.L
    if (this.kind === 'race') r.fuel = Math.max(0, r.fuel - ds / this.L * 2.45 * this.L / 7004)
    if (this.kind === 'race' && r.fuel <= 0 && (r.mode === 'race' || r.mode === 'sc') && r.laps > 0) {
      r.v = Math.min(r.v, 12); r.wantPit = r.wantPit ?? 'essence'
      const dry = ((r as Racer & { _dry?: number })._dry ?? 0) + dt; (r as Racer & { _dry?: number })._dry = dry
      if (dry > 30) this.retire(r, 'Panne d’essence')
    }
    // ─ erreurs, pannes
    this.errors(r, i, ds, ahead, gA, behind, gB, dt)
    // ─ limites de piste : 4 roues au-delà de la ligne blanche (bord asphalte + 1 m)
    const edge = r.d < 0 ? Math.max(this.track.wl[i], this.track.wlR[i]) : Math.max(this.track.wr[i], this.track.wrR[i])
    if (Math.abs(r.d) > edge + 1.0) { if (r.lapValid) { r.lapValid = false; C.trackLimits(r) } }
    // ─ zones DRS : détection (course : < 1 s de la voiture devant, dès le 3e tour)
    for (let z = 0; z < this.drsDet.length; z++) { const det = this.drsDet[z]; if (this.road(r.s - ds, det) > 0 && this.road(r.s, det) <= 0) r.drs = C.drsAllowed(r, ahead && gA < 200 ? gA / Math.max(10, r.v) : 9) }
    if (!this.inZone(r.s)) r.drs = r.drs && this.road(r.s, this.nextZoneStart(r.s)) < 150
    if (r.mode === 'push' || r.mode === 'out' || r.mode === 'cool') r.drs = this.kind !== 'race' && r.mode === 'push' && C.drsGlobal()
    // ─ séance : relais (sortie / rapide / retour)
    this.runLogic(r)
  }
  lastE = new Map<number, number>()
  private kCache = new Map<number, { t: number; k: number }>()
  private paceKCache(r: Racer) { const c = this.kCache.get(r.i); if (c && this.t - c.t < 0.5) return c.k; const k = this.paceK(r); this.kCache.set(r.i, { t: this.t, k }); return k }
  inZone(s: number) { return this.zones.some(([a, b]) => s >= a && s <= b) }
  nextZoneStart(s: number) { let best = this.zones[0][0], bg = 1e9; for (const [a] of this.zones) { const g = this.road(s, a); if (g > 0 && g < bg) { bg = g; best = a } } return best }
  /** attaque (côté intérieur du prochain virage ou opposé à la voiture devant), défense (un seul changement de
   *  direction, jamais au freinage), drapeaux bleus et trafic de qualif (on s'écarte), retour sur la trajectoire */
  private tactics(r: Racer, ahead: Racer | null, gA: number, behind: Racer | null, gB: number, dt: number) {
    const C = this.ctrl, ln = this.line, i = r.idx
    r.attackT = Math.max(0, r.attackT - dt); r.yieldT = Math.max(0, r.yieldT - dt); r.sepT = Math.max(0, r.sepT - dt)
    const edgeL = this.track.wlR[i] - 0.9, edgeR = this.track.wrR[i] - 0.9
    // céder le passage (bleu en course, trafic en qualif) : on se range du côté opposé à la trajectoire et on lève le pied
    const mustYield = behind && gB < Math.max(25, behind.v * 1.2) && (C.isBlue(r, behind) || (this.kind !== 'race' && behind.mode === 'push' && r.mode !== 'push') || (this.kind !== 'race' && behind.player && this.playerOnHot && r.mode !== 'push'))
    if (mustYield) {
      // une fois sur ~25 (pilote distrait), l'IA ne voit pas la voiture arriver → gêne (enquête)
      const rk = r as Racer & { _yr?: number }, key = behind!.i * 1e6 + Math.floor(behind!.dist / this.L)
      if (rk._yr !== key) { rk._yr = key; if (this.rng.next() < 0.03 * (1.15 - r.sk.cons) / 0.25) { r.yieldT = 4; if (behind!.mode === 'push' || behind!.player) C.impeding(r, behind!) } }
      if (r.yieldT === 0) { const side = ln.e[i] > 0 ? -1 : 1; r.off = side < 0 ? -edgeL + 0.3 : edgeR - 0.3; r.v *= 1 - 0.02 * dt * 10 }
      return
    }
    if (ahead && gA < 1.2 * Math.max(20, r.v) && C.mayOvertake(r, ahead)) {
      const pot = r.prof.v[(i + Math.round(gA / this.ds)) % this.N] * this.paceKCache(r) * (r.drs ? 1.03 : 1)
      if (pot > ahead.v + 0.4 || C.isBlue(ahead, r) || ahead.mode === 'out' || ahead.mode === 'cool' || ahead.mode === 'in' || ahead.err) {
        if (r.attackT === 0) {
          // côté : intérieur du prochain virage (point de corde de la trajectoire)
          let apex = i, vmin = 1e9; for (let j = 0; j < 300 / this.ds; j += 4) { const q = (i + j) % this.N; if (ln.v[q] < vmin) { vmin = ln.v[q]; apex = q } }
          let side = Math.sign(ln.e[apex]) || 1
          if (Math.abs(ahead.d - (side < 0 ? -edgeL : edgeR)) < 2.4) side = -side
          if (ahead.off !== null && (C.isBlue(ahead, r) || ahead.mode !== 'push')) side = ahead.off > ahead.d - 0.01 + (ln.e[i] - ahead.d) * 0 && ahead.off > 0 ? -1 : 1
          r.side = side
        }
        r.attackT = 1.5
        r.off = Math.max(-edgeL, Math.min(edgeR, ahead.d + r.side * 2.3))
        return
      }
    }
    // défense : la voiture derrière attaque d'un côté → on couvre l'intérieur une seule fois, hors freinage
    if (behind && this.kind === 'race' && behind.attackT > 0 && gB < 30 && !r.defMoved && C.mayOvertake(behind, r)) {
      const braking = r.prof.v[(i + Math.round(60 / this.ds)) % this.N] < r.v - 6
      if (!braking && this.rng.next() < r.sk.craft * 0.04) { r.off = Math.max(-edgeL, Math.min(edgeR, r.d + behind.side * 1.6)); r.defMoved = true }
    }
    if (!behind || gB > 60) r.defMoved = false
    // ordre d'équipe : en fin de course, l'équipier le plus lent laisse passer une fois
    if (behind && this.kind === 'race' && behind.team === r.team && gB < Math.max(18, behind.v * 0.7) && r.laps > this.laps * 0.65 && behind.sk.craft > r.sk.craft + 0.015 && !(r as Racer & { _ord?: boolean })._ord) {
      ;(r as Racer & { _ord?: boolean })._ord = true
      const side = ln.e[i] > 0 ? -1 : 1
      r.off = side < 0 ? -edgeL + 0.4 : edgeR - 0.4
      this.ctrl.msg(`${r.code} laisse passer ${behind.code} (ordre d'équipe)`, 'team')
      return
    }
    // retour progressif sur la trajectoire (sans couper la route d'une voiture à côté)
    if (r.off !== null && r.attackT === 0 && !r.defMoved && r.sepT <= 0) {
      const side = this.cars.find(o => o !== r && this.onTrack(o) && Math.abs(this.road(r.s, o.s)) < CL + 1 && Math.abs(o.d - r.d) < 3.2)
      if (!side) { const e = ln.e[i]; r.off += (e - r.off) * Math.min(1, dt * 0.8); if (Math.abs(r.off - e) < 0.15) r.off = null }
    }
  }
  /** erreurs RARES, aux freinages et gros virages, selon le pilote et la situation (E, voir docs/RESEARCH_RACE_2020.md) */
  private errors(r: Racer, i: number, ds: number, ahead: Racer | null, gA: number, behind: Racer | null, gB: number, dt: number) {
    if (r.err) { r.err.t -= dt; if (r.err.t <= 0) { if (r.err.kind === 'spin') { r.mode = 'spun'; r.stopT = 4 + this.rng.next() * 8 } r.err = null } }
    if (r.mode === 'spun') { r.v = Math.max(0, r.v - 12 * dt); r.spin += dt * (r.v > 3 ? 6 : 0); r.stopT -= dt
      // repart quand la voie est libre (≥ 3 s devant la prochaine voiture)
      if (r.stopT <= 0) { const clear = r.stopT < -15 || !this.cars.some(o => o !== r && this.onTrack(o) && o.v > 8 && this.road(o.s, r.s) > 0 && this.road(o.s, r.s) < Math.max(60, o.v * 3)); if (clear) { r.mode = this.kind === 'race' ? 'race' : 'in'; r.spin = 0; this.ctrl.clearIncident(r) } }
      return }
    if (r.mode === 'formation' || r.mode === 'grid') return
    // panne mécanique (par tour, indépendante du lieu)
    if (this.kind === 'race' && this.rng.next() < (RELIAB[r.team] ?? 0.0005) * ds / this.L) {
      if (this.rng.next() < 0.55) { r.err = { kind: 'mech', t: 1e9 }; r.wantPit = 'panne'; this.ctrl.msg(`${r.code} : problème mécanique, rentre au ralenti`, 'info') }
      else { this.retire(r, 'Panne moteur'); this.ctrl.incident(r, r.s, 'stopped') }
      return
    }
    const w = this.crit[i] * ds / this.ds / this.critSum
    if (w <= 0) return
    const f = (1 - r.sk.cons) / 0.1, wet = this.wetness()
    let M = 1
    if (wet > 0.25) M *= 1 + wet * 4 * (1.6 - r.sk.wet)
    if (r.tyre.temp < 0.75) M *= 2.5
    if (r.tyre.age * this.wearScale > TYRE[r.tyre.c].cliff) M *= 2
    if ((ahead && gA < r.v * 0.6) || (behind && gB < r.v * 0.5)) M *= 1.8
    if (r.dmg.fw > 0.3) M *= 1.5
    const late = r.attackT > 0 ? 2.5 : 1, push = r.mode === 'push' ? 1.4 : 1
    if (r.mode === 'sc' || this.ctrl.sc.active || this.ctrl.vsc) M *= 0.15
    const diffM = 1.5 - 0.95 * (this.difficulty / 100)
    const p = (x: number) => this.rng.next() < x * w * M * f * diffM
    if (p(0.0003 * (wet > 0.3 ? 2 : 1))) { this.crash(r); return }
    if (p(0.0007)) { r.err = { kind: 'spin', t: 0.8 }; r.v *= 0.7; this.ctrl.incident(r, r.s, 'spin'); r.tyre.flat = Math.min(1, r.tyre.flat + 0.5); return }
    if (p(0.010 * late * push)) { r.err = { kind: 'lock', t: 0.9 }; r.tyre.flat = Math.min(1, r.tyre.flat + 0.08); if (r.tyre.flat > 0.6) r.wantPit = r.wantPit ?? 'plat'; return }
    if (p(0.010 * late * push)) { r.err = { kind: 'wide', t: 1.6 }; r.side = Math.sign(this.line.e[(i + Math.round(80 / this.ds)) % this.N]) || 1; return }
  }
  crash(r: Racer) {
    const heavy = this.rng.next() < 0.7
    r.v = 0; r.d = Math.sign(r.d || 1) * ((r.d < 0 ? this.track.WL[r.idx] : this.track.WR[r.idx]) - 0.6)
    if (heavy) { this.retire(r, 'Accident'); this.ctrl.incident(r, r.s, 'crash') }
    else { r.dmg.fw = 1; r.wantPit = 'aileron'; r.mode = 'spun'; r.stopT = 6; this.ctrl.incident(r, r.s, 'spin') }
  }
  retire(r: Racer, why: string) { r.out = why; r.mode = 'dnf'; r.v = 0; this.ctrl.msg(`${r.code} abandonne : ${why.toLowerCase()}`, 'info') }
  // ───────────── stands
  boxOf(team: string) {
    // 42 garages espacés de 6,4 m (New Bot, mesure sur le modèle) répartis dans la zone limitée ; FIA/F1 en 1-5
    if (!this.pit || !this.pitCum) return 0
    const a = this.pitCum[this.pit.iIn], b = this.pitCum[this.pit.iOut], g = 6 + GARAGE_ORDER.indexOf(team) * 3 + 1, span = 42 * 6.4
    const start = a + Math.max(20, (b - a - span) / 2)
    return Math.min(b - 15, start + (g - 0.5) * 6.4)
  }
  enterPit(r: Racer) { r.prevMode = r.mode === 'in' || this.kind !== 'race' ? 'garage' : r.mode; r.mode = 'pit'; r.pitP = 0; r.pitT = 0; r.boxP = this.boxOf(r.team); r.off = null; r.attackT = 0; r.pitLat = 0
    this.ctrl.pitEvent(r, 'in') }
  /** départ du garage (essais/qualif) : la voiture apparaît à son box, en voie de travail, et rejoint la voie rapide */
  leaveGarage(r: Racer) { r.mode = 'pit'; r.prevMode = 'out'; r.pitP = this.boxOf(r.team); r.boxP = -1; r.pitT = -1; r.v = 0; r.pitLat = 2.7; r.tyre.temp = 0.72; r.tyre.age = 0; r.tyre.flat = 0; r.lapValid = false
    if (!r.tyre.used.includes(r.tyre.c)) r.tyre.used.push(r.tyre.c) }
  private stepPit(r: Racer, dt: number) {
    const P = this.pit!, c = this.pitCum!, inLim = r.pitP >= c[P.iIn] - 2 && r.pitP <= c[P.iOut]
    let vt = inLim ? PIT_LIMIT - 0.3 : Math.min(55, r.prof.v[this.idxOf(P.s[this.pitIdx(r.pitP)])] * 0.8)
    if (r.pitP < c[P.iIn]) vt = Math.min(vt, Math.sqrt(PIT_LIMIT ** 2 + 2 * 14 * Math.max(0, c[P.iIn] - 4 - r.pitP)))
    // voie de travail seulement pour s'arrêter au box ; drive-through et file = voie rapide
    const wantWork = r.boxP > 0 && r.boxP - r.pitP < 48 && r.boxP - r.pitP > -2
    const latT = wantWork ? 2.7 : 0
    r.pitLat += (latT - r.pitLat) * Math.min(1, dt * 1.6)
    // arrêt exactement sur la case (abscisse du chemin, voie de travail)
    if (r.boxP > 0) { const togo = r.boxP - r.pitP; vt = Math.min(vt, Math.sqrt(2 * 9 * Math.max(0, togo))); if (togo < 0.35) { r.v = 0; r.pitP = r.boxP; r.pitLat = 2.7; this.serviceTick(r, dt); this.posePit(r); return } }
    // file / voiture devant dans la voie
    for (const o of this.cars) if (o !== r && o.mode === 'pit') { const g = o.pitP - r.pitP; if (g > 0 && g < 14) vt = Math.min(vt, Math.max(0, o.v + (g - 8) * 0.8)) }
    // feu de sortie : on s'arrête sur la ligne tant qu'il est rouge (drapeau rouge compris)
    const exitP = c[P.iExit]
    if (!this.ctrl.pitExitGreen() && r.pitP < exitP) vt = Math.min(vt, Math.sqrt(2 * 8 * Math.max(0, exitP - r.pitP - 1.2)))
    // drapeau rouge : file dans la voie rapide à la sortie, dans l'ordre
    if (this.ctrl.red) { const q = this.ctrl.redSlot(r); if (q !== null) { const tgt = exitP - 8 - q * 8; vt = Math.min(vt, Math.sqrt(2 * 6 * Math.max(0, tgt - r.pitP))); if (tgt - r.pitP < 0.5) { r.v = 0; r.mode = 'redq'; r.pitLat = 0; return } } }
    r.v = Math.max(0, r.v + Math.max(-30 * dt, Math.min(10 * dt, vt - r.v)))
    const before = r.pitP; r.pitP += r.v * dt
    if (inLim && r.v > PIT_LIMIT + 0.4) this.ctrl.pitSpeeding(r, r.v)
    if (before < exitP && r.pitP >= exitP) {
      if (!this.ctrl.pitExitGreen()) this.ctrl.pitLine(r, 'sortie')
      this.ctrl.pitEvent(r, 'out')
    }
    // quitter le chemin avant la ligne de sortie = on coupe la ligne
    if (r.pitP < exitP - 8 && Math.abs(r.pitLat) > 8) this.ctrl.pitLine(r, 'sortie')
    if (r.pitP >= this.pitLen) {
      r.mode = r.prevMode === 'garage' ? 'out' : r.prevMode
      const k = P.n - 1
      r.s = this.wrapS(P.s[k]); r.d = P.d[k]; r.idx = this.idxOf(r.s); r.lat = 0; r.off = P.d[k]; r.pitLat = 0
    }
    this.posePit(r)
    if (r.boxP < 0 && r.pitT < 0) r.pitT = 0
  }
  private posePit(r: Racer) { const P = this.pit!, k = this.pitIdx(r.pitP); const s = P.s[k]; r.dist += this.road(r.s, s); r.s = this.wrapS(s); r.lastS = r.s }
  /** service au box : pénalité (immobile, personne ne touche la voiture), stop-and-go 10 s, puis pneus / aileron */
  private serviceTick(r: Racer, dt: number) {
    if (r.pitT === 0) {
      let tStill = 0, work = false
      if (r.sgPend > 0) { tStill = 10; r.sgPend--; this.ctrl.msg(`${r.code} purge son stop-and-go de 10 s`, 'pen') }
      else {
        if (r.pen > 0) { tStill += r.pen; this.ctrl.msg(`${r.code} purge sa pénalité de ${r.pen} s`, 'pen'); r.penServed += r.pen; r.pen = 0 }
        const crew = this.kind === 'race' ? PIT_CREW[r.team] ?? 2.7 : 1, slow = this.kind === 'race' && this.rng.next() < 0.04 ? 2 + this.rng.next() * 6 : 0
        tStill += crew + Math.abs(this.rng.gauss()) * 0.25 + slow + (r.dmg.fw > 0.2 ? 7 : 0)
        if (slow && this.kind === 'race') this.ctrl.msg(`${r.code} : arrêt lent (${(crew + slow).toFixed(1)} s)`, 'info')
        work = true
      }
      r.pitT = tStill; r.pitWhy = work ? 'work' : 'sg'
      ;(r as Racer & { _work?: boolean })._work = work
    }
    r.pitT -= dt
    const total = (r as Racer & { _pitTot?: number })._pitTot || r.pitT
    if (!(r as Racer & { _pitTot?: number })._pitTot && r.pitT > 0) (r as Racer & { _pitTot?: number })._pitTot = r.pitT + dt
    const tot = (r as Racer & { _pitTot?: number })._pitTot ?? 1
    const u = 1 - Math.max(0, r.pitT) / tot
    const marks = [0.12, 0.28, 0.4, 0.62, 0.84, 0.94, 1]
    const names = ['stop', 'jack', 'guns', 'off', 'on', 'drop', 'go']
    r.pitPhase = names[marks.findIndex(m => u <= m)] ?? 'go'
    if (r.pitT <= 0) {
      r.boxP = -1; r.pitT = -1; r.pitPhase = 'go'; (r as Racer & { _pitTot?: number })._pitTot = 0
      if (this.kind !== 'race' && r.prevMode === 'garage') { r.mode = 'garage'; r.v = 0; r.wantPit = null; return }
      if (r.wantPit === 'panne') { r.wantPit = null; this.retire(r, 'Panne mécanique'); r.mode = 'dnf'; return }
      r.wantPit = null
      if ((r as Racer & { _work?: boolean })._work) this.fitNext(r)
      r.stops++
      this.ctrl.release(r)
    }
  }
  private fitNext(r: Racer) {
    const lapsLeft = this.laps - r.laps, wet = this.wetness()
    let c: Comp = r.plan.find(p => p.lap >= r.laps)?.c ?? (lapsLeft * this.wearScale > 26 ? 'H' : 'M')
    if (wet > 0.75) c = 'W'; else if (wet > 0.3) c = 'I'
    else if (!r.tyre.used.some(u => u !== c && u !== 'I' && u !== 'W') && r.tyre.used.length && r.tyre.used[0] === c) c = c === 'H' ? 'M' : 'H' // 2 gommes obligatoires (sec)
    r.tyre = { c, age: 0, temp: 0.75, flat: 0, punct: 0, used: [...r.tyre.used, c] }
    r.dmg.fw = 0; r.err = r.err?.kind === 'mech' ? r.err : null
  }
  // ───────────── séance (essais / qualif)
  private garageLogic(r: Racer) {
    if (this.kind === 'race' || this.chequered || r.out) return
    if (r.runIdx < r.runs.length && this.t >= r.runs[r.runIdx] && this.ctrl.pitExitGreen() && (this.t + this.targetQ(r.id) * 1.9 < this.sessionLen || r.runIdx === 0)) {
      r.runIdx++; r.tyre.c = this.kind === 'qualifying' ? 'S' : this.rng.pick<Comp>(['S', 'M', 'M', 'H'])
      r.pushLeft = this.kind === 'qualifying' ? (this.rng.next() < 0.3 ? 2 : 1) : 2 + Math.floor(this.rng.next() * 4)
      this.leaveGarage(r)
    }
  }
  private runLogic(r: Racer) {
    if (this.kind === 'race' || r.mode === 'pit') return
    // lancement du tour rapide dès l'avant-dernier virage (on ne commence pas un tour lancé au ralenti)
    const toLine = this.road(r.s, 0), rp = r as Racer & { _prep?: boolean }
    if ((r.mode === 'out' || r.mode === 'cool') && !this.chequered && toLine > 0 && toLine < 650 && r.tyre.temp > 0.85 && (r.mode === 'cool' || r.pushLeft > 0)) { r.mode = 'push'; rp._prep = true }
    if ((r.mode === 'in') && !r.wantPit) r.wantPit = 'fin de relais'
  }
  /** franchissement de la ligne (tour bouclé) et des 2 portes de secteurs, pour l'IA comme pour le joueur */
  private timing(r: Racer) {
    if (r.mode === 'garage') return
    const b = Math.floor(r.dist / this.binW)
    if (this.kind === 'race' && b >= 0 && b < this.leaderT.length && isNaN(this.leaderT[b])) this.leaderT[b] = this.t
    if (this.kind === 'race' && b >= 0 && b < this.leaderT.length) r.gap = this.t - this.leaderT[b]
    const lapNow = Math.floor(r.dist / this.L)
    const gates = [2050 * this.L / 7004, 5000 * this.L / 7004]
    const prevDist = (r as Racer & { _pd?: number })._pd ?? r.dist; (r as Racer & { _pd?: number })._pd = r.dist
    for (let g = 0; g < 2; g++) { const gd = Math.floor(prevDist / this.L) * this.L + gates[g]; if (prevDist < gd && r.dist >= gd && r.sector === g && !isNaN(r.secT0)) { r.sectors[g] = this.t - r.secT0; r.secT0 = this.t; r.sector = g + 1 } }
    if (lapNow > Math.floor(prevDist / this.L) && r.dist > 0) {
      if (!isNaN(r.lapT0)) {
        const T = this.t - r.lapT0; r.sectors[2] = this.t - r.secT0
        r.last = T; r.lapTimes.push(T)
        const hot = (r as Racer & { _hot?: boolean })._hot !== false
        const valid = r.lapValid && (this.kind === 'race' || r.player || hot)
        if (valid && (isNaN(r.best) || T < r.best)) { r.best = T; this.ctrl.bestLap(r, T) }
        r.laps = lapNow
        if ((globalThis as any).process?.env?.DBG === r.id) console.log('LAP', r.id, T.toFixed(3), r.mode, valid, r.tyre.c, r.tyre.temp.toFixed(2))
        this.ctrl.lapDone(r, T, valid)
      } else r.laps = Math.max(r.laps, lapNow)
      r.lapT0 = this.t; r.secT0 = this.t; r.sector = 0; r.sectors = []; r.lapValid = true
      if (!r.player) this.lapPlan(r)
      ;(r as Racer & { _hot?: boolean })._hot = r.player || this.kind === 'race' || r.mode === 'push'
    }
  }
  /** fin de tour IA : enchaînement des relais en essais/qualif, arrêts prévus en course */
  private lapPlan(r: Racer) {
    if (this.kind !== 'race') {
      const rp = r as Racer & { _prep?: boolean }
      if (rp._prep) { rp._prep = false; if (!this.chequered) return }
      if (this.chequered) { r.mode = 'in'; r.wantPit = 'drapeau'; return }
      if (r.mode === 'out') r.mode = 'push'
      else if (r.mode === 'push') { r.pushLeft--; r.mode = r.pushLeft > 0 ? (this.kind === 'qualifying' ? 'cool' : 'push') : 'in' }
      else if (r.mode === 'cool') r.mode = 'push'
      if (r.mode === 'in') r.wantPit = 'fin de relais'
      return
    }
    // course : arrêt prévu (tour du plan, usure au-delà de la falaise, dégâts, crevaison, météo)
    const ty = TYRE[r.tyre.c], age = r.tyre.age * this.wearScale, left = this.laps - r.laps
    if (left <= 0) return
    const wet = this.wetness(), slick = !(r.tyre.c === 'I' || r.tyre.c === 'W')
    if (r.plan.some(p => p.lap === r.laps) && left > 1) r.wantPit = r.wantPit ?? 'plan'
    if (age > ty.cliff + 4 && left * this.wearScale > 4) r.wantPit = r.wantPit ?? 'pneus usés'
    if (wet > 0.35 && slick && left > 1) r.wantPit = 'pluie'
    if (wet < 0.18 && !slick && left > 2) r.wantPit = 'piste sèche'
    if (r.dmg.fw > 0.3 || r.tyre.punct) r.wantPit = 'dégâts'
    if (r.dtPend > 0) r.wantPit = 'drive'
    if (r.sgPend > 0) r.wantPit = 'stop-go'
    if (this.ctrl.sc.active && r.plan.some(p => p.lap - r.laps <= 8 && p.lap >= r.laps - 1) && left > 1) r.wantPit = r.wantPit ?? 'safety car'
    if (this.ctrl.vsc && age > ty.cliff * 0.72 && left > 2) r.wantPit = r.wantPit ?? 'vsc'
    const threat = this.cars.some(o => o !== r && !o.out && this.road(o.s, r.s) > 0 && this.road(o.s, r.s) < Math.max(40, o.v * 2.4) && o.v > r.v - 2)
    if (threat && age > ty.cliff * (this.difficulty > 70 ? 0.62 : 0.85) && left > 6 && this.difficulty > 55) r.wantPit = r.wantPit ?? 'undercut'
    // règle des 2 gommes (sec) : arrêt obligatoire avant la fin
    if (left === 2 && slick && wet < 0.2 && new Set(r.tyre.used.filter(u => u !== 'I' && u !== 'W')).size < 2) r.wantPit = r.wantPit ?? 'gomme obligatoire'
  }
  /** stratégie de départ : top 10 sur la gomme de leur meilleur Q2 (tendre), les autres choisissent ; 1 arrêt prévu */
  planRace() {
    for (const r of this.cars) {
      if (r.player) continue
      const top10 = r.slot < 10
      r.tyre.c = top10 ? 'S' : this.rng.next() < 0.7 ? 'M' : this.rng.next() < 0.6 ? 'H' : 'S'
      r.tyre.used = [r.tyre.c]
      const life = TYRE[r.tyre.c].cliff / this.wearScale
      const agg = 0.55 + 0.4 * (this.difficulty / 100)
      const two = this.laps >= 20 && this.rng.next() < (this.difficulty > 60 ? 0.45 : 0.15)
      if (two) {
        const a = Math.max(2, Math.round(this.laps * (0.28 + this.rng.next() * 0.08)))
        const b = Math.max(a + 2, Math.round(this.laps * (0.62 + this.rng.next() * 0.08)))
        r.plan = [{ lap: a, c: 'M' }, { lap: Math.min(this.laps - 2, b), c: 'H' }]
      } else {
        let lap = Math.round(Math.min(this.laps - 2, Math.max(2, life * (0.7 + this.rng.next() * 0.3 * agg))))
        if (this.rng.next() < (this.difficulty < 50 ? 0.22 : 0.08)) lap = Math.max(2, Math.min(this.laps - 1, lap + (this.rng.next() < 0.5 ? -2 : 3)))
        const second: Comp = r.tyre.c === 'H' ? 'M' : (this.laps - lap) * this.wearScale > 24 ? 'H' : 'M'
        r.plan = [{ lap, c: second }]
      }
    }
  }
  // ───────────── contacts
  private contacts() {
    const A = this.cars
    for (let a = 0; a < A.length; a++) for (let b = a + 1; b < A.length; b++) {
      const p = A[a], q = A[b]
      if (!this.onTrack(p) || !this.onTrack(q)) continue
      const ds = this.road(p.s, q.s), dd = q.d - p.d
      if (Math.abs(ds) > CL - 0.4 || Math.abs(dd) > CW - 0.1) continue
      const rear = ds > 0 ? p : q, front = ds > 0 ? q : p
      const dr = (x: Racer) => x.player ? x.lat : ((x as Racer & { _dr?: number })._dr ?? 0)
      const dvLong = rear.v - front.v, dvLat = Math.min(6, Math.abs(dr(q) - dr(p)))
      const ovS = CL - 0.4 - Math.abs(ds), ovD = CW - 0.1 - Math.abs(dd)
      const sideHit = ovD < ovS * 0.6
      if (p.player || q.player) { this.playerContact(p.player ? p : q, p.player ? q : p, sideHit); continue }
      if (sideHit) { const sg = Math.sign(dd) || 1; p.d -= sg * ovD * 0.5; q.d += sg * ovD * 0.5 }
      else { rear.v = Math.max(0, Math.min(rear.v, front.v) - Math.max(0, dvLong) * 0.2); front.v += Math.max(0, dvLong) * 0.3; const sg = Math.sign(dd) || 1; p.d -= sg * 0.3; q.d += sg * 0.3 }
      this.contactDamage(rear, front, sideHit ? dvLat * 1.5 : dvLong, sideHit)
    }
    this.separate()
  }
  /** pousse les voitures qui se chevauchent (l'enveloppe 5,6 × 1,9 m) et les y maintient un instant */
  private separate() {
    const A = this.cars
    for (let a = 0; a < A.length; a++) for (let b = a + 1; b < A.length; b++) {
      const p = A[a], q = A[b]
      if (!this.onTrack(p) || !this.onTrack(q)) continue
      const ds = this.road(p.s, q.s), dd = q.d - p.d
      const ovS = CL + 0.2 - Math.abs(ds), ovD = CW + 0.15 - Math.abs(dd)
      if (ovS <= 0 || ovD <= 0) continue
      if (ovD < ovS * 1.15) {
        const sg = Math.sign(dd) || 1, push = ovD * 0.55 + 0.04
        if (!p.player) { p.d -= sg * push; p.off = p.d; p.sepT = 0.45 }
        if (!q.player) { q.d += sg * push; q.off = q.d; q.sepT = 0.45 }
      } else {
        const rear = ds > 0 ? p : q
        if (!rear.player) rear.v = Math.min(rear.v, Math.max(0, (ds > 0 ? q : p).v - 0.6))
      }
    }
  }
  private contactDamage(rear: Racer, front: Racer, dv: number, side: boolean) {
    if ((globalThis as any).process?.env?.CDBG && dv > 2.5) console.log('CONTACT', this.t.toFixed(2), rear.code, front.code, 'dv', dv.toFixed(1), 'side', side, 's', rear.s.toFixed(0), front.s.toFixed(0), 'd', rear.d.toFixed(2), front.d.toFixed(2), 'v', rear.v.toFixed(1), front.v.toFixed(1), rear.mode, front.mode, rear.off?.toFixed(1), front.off?.toFixed(1), rear.err?.kind, front.err?.kind)
    if (dv < 2.5) return
    const sev = Math.min(1, (dv - 2.5) / 14)
    if (!side) { if (!rear.player) rear.dmg.fw = Math.min(1, rear.dmg.fw + sev * 1.2); if (!front.player && this.rng.next() < sev * 0.6) front.tyre.punct = 1 }
    else for (const r of [rear, front]) if (!r.player && this.rng.next() < sev * 0.5) r.tyre.punct = 1
    for (const r of [rear, front]) if (!r.player) { if (r.dmg.fw > 0.3 || r.tyre.punct) r.wantPit = 'dégâts'; if (sev > 0.8 && this.rng.next() < 0.3 && !r.err) { r.err = { kind: 'spin', t: 0.4 }; this.ctrl.incident(r, r.s, 'spin') } }
    this.ctrl.collision(rear, front, dv, side)
  }
  private pAhead = new Map<Racer, number>()
  /** règles appliquées au joueur : dépassement sous drapeau jaune / SC / VSC, delta VSC (vitesse), drapeau bleu ignoré */
  private playerRules(p: Racer, c: Vehicle) {
    const C = this.ctrl
    if (this.kind === 'race' && (C.phase === 'racing' || C.phase === 'formation')) for (const o of this.cars) {
      if (o === p || !this.onTrack(o)) { this.pAhead.delete(o); continue }
      const g = this.road(p.s, o.s), was = this.pAhead.get(o)
      if (Math.abs(g) > 40) { this.pAhead.delete(o); continue }
      if (was !== undefined && was > 0 && g < -1 && !p.inPit) {
        const ok = C.phase === 'racing' && (C.mayOvertake(p, o) || C.isBlue(o, p) || o.mode === 'pit' || o.wantPit !== null && Math.abs(o.d) > 4)
        if (!ok) C.caseNew(p, o, C.phase === 'formation' ? 'dépassement pendant le tour de formation' : C.sc.active ? 'dépassement sous safety car' : C.vsc ? 'dépassement sous VSC' : 'dépassement sous drapeau jaune', C.sc.active || C.vsc ? '10s' : '5s', 'dépassement interdit', 8)
      }
      this.pAhead.set(o, g)
    }
    // VSC : delta minimum (E : ≈ 60 % de la vitesse de course au même point)
    if (C.vsc && !p.inPit) { const ref = this.profs.get(p.team)!.v[this.idxOf(p.s)] * 0.62; C.vscOver(p, p.v, ref, 1 / 60) }
    void c
  }
  /** contact joueur ↔ IA : impulsion et dégâts sur la vraie physique du joueur (Vehicle.carHit) */
  private playerContact(pl: Racer, ai: Racer, side: boolean) {
    const c = this.vehicle; if (!c) return
    const nxw = pl.wx - ai.wx, nzw = pl.wz - ai.wz, n = Math.hypot(nxw, nzw) || 1, nx = nxw / n, nz = nzw / n
    const avx = ai.hx * ai.v, avz = ai.hz * ai.v
    const dvn = -((c.vel[0] - avx) * nx + (c.vel[2] - avz) * nz)
    if (dvn <= 0.05) { ai.d += (ai.d - pl.d >= 0 ? 1 : -1) * 0.05; return }
    const fwd = -(c.R[6] * nx + c.R[8] * nz) // > 0 : l'IA est derrière le joueur
    const right = c.R[0] * nx + c.R[2] * nz
    const part = side ? (right > 0 ? (fwd < 0 ? 10 : 12) : (fwd < 0 ? 11 : 13)) : fwd < 0 ? 1 : (this.rng.next() < 0.5 ? 2 : 12 + (right > 0 ? 0 : 1))
    c.carHit(nx, nz, dvn, part)
    ai.v = Math.max(0, ai.v - dvn * 0.45 * Math.max(0, ai.hx * -nx + ai.hz * -nz))
    ai.d += (ai.d - pl.d >= 0 ? 1 : -1) * Math.min(0.4, dvn * 0.05); ai.lat *= 0.3
    const rearIsPlayer = !side && fwd < 0
    this.contactDamage(rearIsPlayer ? pl : ai, rearIsPlayer ? ai : pl, dvn, side)
  }
  // ───────────── classement en direct
  classify() {
    const A = this.cars
    if (this.kind === 'race' && this.ctrl.red && this.ctrl.frozenOrder) {
      const rank = new Map(this.ctrl.frozenOrder.map((r, i) => [r, i]))
      const act = A.slice().sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || (rank.get(a) ?? 99) - (rank.get(b) ?? 99))
      act.forEach((r, k) => {
        r.pos = k + 1
        const g = (r as Racer & { _fgap?: number })._fgap
        if (g !== undefined) r.gap = g
        r.int = k === 0 ? 0 : (act[k - 1].out || r.out ? NaN : r.gap - act[k - 1].gap)
      })
      return
    }
    if (this.kind === 'race') {
      // classement : distance parcourue ; une voiture arrivée est figée sur (tours, ordre d'arrivée)
      const sc = (r: Racer) => r.finished ? r.laps * this.L + (1e6 - r.finishT) * 1e-6 : r.dist
      const act = A.slice().sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || (a.out && b.out ? b.dist - a.dist : sc(b) - sc(a)))
      act.forEach((r, k) => { r.pos = k + 1; r.int = k === 0 ? 0 : (act[k - 1].out || r.out ? NaN : r.gap - act[k - 1].gap) })
    } else {
      const act = A.slice().sort((a, b) => (isNaN(a.best) ? 1e9 : a.best) - (isNaN(b.best) ? 1e9 : b.best))
      const p1 = act[0].best
      act.forEach((r, k) => { r.pos = k + 1; r.gap = isNaN(r.best) ? NaN : r.best - p1; r.int = k === 0 || isNaN(r.best) ? NaN : r.best - act[k - 1].best })
    }
  }
  ordered() { return this.cars.slice().sort((a, b) => a.pos - b.pos) }
  leader() { return this.ordered()[0] }
}
const smp = { h: 0, nx: 0, ny: 1, nz: 0, type: 1, s: 0, d: 0, i: -1 }
