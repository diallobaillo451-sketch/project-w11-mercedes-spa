/** Lot 8 C — direction de course 2020 : départ (tour de formation, places de grille, 5 feux, faux départ),
 *  drapeaux par poste de commissaires (jaune / double jaune / bleu / rouge / vert, panneaux SC et VSC), safety car
 *  (AMG GT Black Series, sa propre physique de voiture de route), VSC (delta), drapeau rouge (retour dans la voie des
 *  stands, travail autorisé, reprise derrière la SC puis départ arrêté), limites de piste, DRS, drapeaux bleus,
 *  feu de sortie des stands, commissaires (incident noté → sous enquête → décision) et pénalités (5 s, 10 s,
 *  drive-through, stop-and-go 10 s, places de grille, avertissements). Références : règlement sportif F1 2020
 *  (FIA, éd. 13) — voir docs/RESEARCH_RACE_2020.md. */
import type { RaceSim, Racer, Msg } from './sim.ts'
import { speedProfile, profileLapTime } from '../track/racingLine.ts'
import { TYRE } from './data.ts'

export type Panel = 'off' | 'yellow' | 'double' | 'blue' | 'red' | 'green' | 'sc' | 'vsc' | 'chequered'
export interface Post { n: number; s: number; side: number; panel: Panel; flag: Panel; x?: number; z?: number }
export interface Incident { r: Racer | null; s: number; kind: 'spin' | 'stopped' | 'crash' | 'debris'; sev: 'yellow' | 'double'; until: number; t: number }
export interface Case { id: number; t: number; a: Racer; b: Racer | null; what: string; state: 'noted' | 'invest' | 'done'; tInv: number; tDec: number; pen: string; reason: string }
export type Phase = 'pre' | 'formation' | 'gridding' | 'lights' | 'racing' | 'red' | 'resume' | 'chequered' | 'done' | 'session'

export class RaceControl {
  sim: RaceSim
  phase: Phase = 'session'
  posts: Post[] = []
  incidents: Incident[] = []
  cases: Case[] = []; private caseN = 0
  /** safety car : position piste, vitesse, état (garée / déployée / en tête / rentre), gyrophares */
  sc = { active: false, mode: 'park' as 'park' | 'out' | 'lead' | 'in', s: 0, d: 0, v: 0, lights: false, lapsLed: 0, caught: false, inThisLap: false, tEnd: 0, prof: null as Float64Array | null, T: 0, dist: 0, wx: 0, wy: 0, wz: 0, hx: 0, hz: -1, pitP: 0 }
  vsc = false; vscEnding = 0; vscEnd = 0
  red = false; redT = 0; resumeAt = 0; private redOrder: Racer[] = []
  /** ordre et écarts figés au drapeau rouge (le classement live ne bouge plus) */
  frozenOrder: Racer[] | null = null
  unlap = false
  lightsN = 0; lightsT = 0; lightsHold = 0; goT = -1; private gridT = 0; jumpRef = { s: 0, ok: false }
  greenT = 0
  /** feu de case : rouge pendant le travail, vert au lâcher */
  boxLight: 'red' | 'green' = 'red'
  private boxGreenUntil = 0
  private blueFor = new Map<number, { t: number; posts: number; warned: boolean }>()
  private lastPost = new Map<number, number>()
  fastest: { r: Racer; t: number } | null = null
  constructor(sim: RaceSim) {
    this.sim = sim
    this.buildPosts()
    this.buildSC()
    if (sim.kind === 'race') this.phase = 'pre'
  }
  // ───────────── postes de commissaires (placeholders tous les ~230 m, côtés alternés ; remplacés par marshals.json)
  buildPosts(json?: { posts: { n?: number; id?: number; s: number; side?: number | string; x?: number; z?: number }[] }) {
    const L = this.sim.L
    if (json?.posts?.length) { this.posts = json.posts.map((p, k) => ({ n: p.n ?? p.id ?? k + 1, s: this.sim.wrapS(p.s * L / 6998.256), side: typeof p.side === 'string' ? (p.side === 'right' ? 1 : -1) : p.side ?? (k % 2 ? 1 : -1), panel: 'off' as Panel, flag: 'off' as Panel, x: p.x, z: p.z })).sort((a, b) => a.s - b.s); return }
    const n = Math.max(12, Math.round(L / 230))
    this.posts = Array.from({ length: n }, (_, k) => ({ n: k + 1, s: (k + 0.35) * L / n, side: k % 2 ? 1 : -1, panel: 'off' as Panel, flag: 'off' as Panel }))
  }
  postBefore(s: number) { let best = this.posts[0], g = 1e9; for (const p of this.posts) { const d = this.sim.road(p.s, s); if (d >= 0 && d < g) { g = d; best = p } } return best }
  postAfter(s: number) { let best = this.posts[0], g = 1e9; for (const p of this.posts) { const d = this.sim.road(s, p.s); if (d > 0 && d < g) { g = d; best = p } } return best }
  // ───────────── safety car : Mercedes-AMG GT Black Series (730 ch, 800 N·m, ~1 600 kg avec équipage) — sa propre physique
  private buildSC() {
    const P = { m: 1600, ClA: 1.2, CdA: 0.82, power: (v: number) => Math.min(537e3 * 0.86, 800 * 9.5 * 3.2 * Math.max(v, 3) / 0.34 / 3.2), muM: 1.22, muA: 1.0, vCap: 325 / 3.6, tracFrac: 0.5, brakeK: 0.95 }
    const v = speedProfile(this.sim.track, this.sim.line, P, 1)
    this.sc.prof = v; this.sc.T = profileLapTime(v, this.sim.ds)
  }
  scDeploy(why: string) {
    if (this.sc.active || this.red || this.sim.kind !== 'race') return
    const S = this.sc, P = this.sim.pit
    S.active = true; S.mode = 'out'; S.lights = true; S.caught = false; S.inThisLap = false; S.lapsLed = 0; this.unlap = false
    S.s = P ? this.sim.wrapS(P.s[P.n - 1]) : this.sim.wrapS(this.sim.leader().s + 400); S.d = P ? P.d[P.n - 1] : 0; S.v = 20
    // la SC sort devant le leader si possible (sinon le leader la rattrape)
    S.tEnd = this.sim.t + why.length * 0 + 140 + this.sim.rng.next() * 100
    this.vsc = false
    this.msg('SAFETY CAR DÉPLOYÉE — ' + why, 'rc')
  }
  vscDeploy(why: string) {
    if (this.sc.active || this.red || this.vsc || this.sim.kind !== 'race') return
    this.vsc = true; this.vscEnd = this.sim.t + 45 + this.sim.rng.next() * 50; this.vscEnding = 0
    this.msg('VIRTUAL SAFETY CAR DÉPLOYÉE — ' + why, 'rc')
  }
  redFlag(why: string) {
    if (this.red) return
    this.red = true; this.redT = this.sim.t; this.sc.active = false; this.sc.mode = 'park'; this.vsc = false
    const order = this.sim.ordered().filter(r => !r.out)
    this.redOrder = order
    this.frozenOrder = order.slice()
    for (const r of order) (r as Racer & { _fgap?: number })._fgap = r.gap
    this.resumeAt = this.sim.t + (this.sim.kind === 'race' ? 25 : 35)
    this.msg('DRAPEAU ROUGE — ' + why + (this.sim.kind === 'race' ? ' · toutes les voitures dans la voie des stands, écarts figés' : ' · séance suspendue'), 'rc')
    for (const r of this.sim.cars) if (!r.player && !r.out && r.mode !== 'garage') { r.wantPit = 'drapeau rouge'; if (this.sim.kind !== 'race') r.mode = r.mode === 'pit' ? r.mode : 'in' }
  }
  redSlot(r: Racer) { if (!this.red || this.sim.kind !== 'race') return null; const k = this.redOrder.indexOf(r); return k < 0 ? null : k }
  // ───────────── boucle
  update(dt: number) {
    const S = this.sim
    if (S.kind === 'race') this.startProcedure(dt)
    // incidents qui se terminent
    for (const inc of this.incidents.slice()) if (S.t > inc.until && !(inc.r && inc.r.mode === 'spun')) this.endIncident(inc)
    // fin de VSC
    if (this.vsc && S.t > this.vscEnd && !this.vscEnding) { this.vscEnding = S.t + 12; this.msg('FIN DE VSC — la piste redevient verte dans quelques secondes', 'rc') }
    if (this.vscEnding && S.t > this.vscEnding) { this.vsc = false; this.vscEnding = 0; this.greenT = S.t + 10; this.msg('PISTE LIBRE', 'flag') }
    if (this.sc.active) this.scLogic(dt)
    if (this.red) this.redLogic()
    this.bluesLogic(dt)
    this.panels()
    this.stewards()
    if (this.boxLight === 'green' && S.t > this.boxGreenUntil) this.boxLight = 'red'
  }
  // ───────────── départ : tour de formation, mise en grille, feux
  private startProcedure(dt: number) {
    const S = this.sim
    if (this.phase === 'pre') return
    if (this.phase === 'formation' || this.phase === 'gridding') {
      // fin du tour de formation : chaque voiture s'arrête sur sa place, le joueur aussi
      const ai = S.cars.filter(r => !r.player && !r.out)
      const allIn = ai.every(r => r.mode === 'grid')
      const p = S.player, slot = S.gridPos(p.slot), gap = S.road(p.s, slot.s)
      const pOk = p.dist > -this.sim.L * 0.5 + 0 && Math.abs(gap) < 4 && p.v < 0.8 && (this as RaceControl).formationLeft(p) < 300
      if (allIn) { this.phase = 'gridding'; this.gridT += dt }
      if (allIn && (pOk || this.gridT > 30)) { this.phase = 'lights'; this.lightsT = 0; this.lightsN = 0; this.lightsHold = 0.4 + S.rng.next() * 2.4; this.jumpRef = { s: p.s, ok: true }; this.msg('Toutes les voitures sont en grille · départ dans quelques secondes', 'rc')
        if (!pOk) this.placePlayerRequest = true }
      return
    }
    if (this.phase === 'lights') {
      this.lightsT += dt; this.lightsN = Math.min(5, Math.floor(this.lightsT))
      // faux départ : la voiture bouge avant l'extinction (tolérance des capteurs ≈ 0,5 m)
      const mv = Math.abs(S.road(this.jumpRef.s, S.player.s))
      if (this.jumpRef.ok && mv > 0.6) { this.jumpRef.ok = false; this.caseNew(S.player, null, 'faux départ', mv > 3 ? 'drive' : '5s', 'mouvement avant l’extinction des feux', 3) }
      if (this.lightsT >= 5 + this.lightsHold) this.go()
    }
  }
  placePlayerRequest = false
  /** « passer le tour de formation » : toutes les voitures directement sur leur place (le joueur est replacé par le jeu) */
  skipFormation() {
    if (this.phase !== 'formation' && this.phase !== 'gridding' && this.phase !== 'pre') return
    const S = this.sim
    for (const r of S.cars) { if (r.out) continue; if (!r.player) { S.placeOnGrid(r); r.mode = 'grid'; r.tyre.temp = Math.max(r.tyre.temp, 0.85) } }
    this.phase = 'gridding'; this.gridT = 31; this.placePlayerRequest = true
  }
  formationLeft(r: Racer) { return r.mode === 'grid' ? 0 : Math.max(0, -r.dist) }
  /** extinction des feux : chrono de course à zéro, temps de réaction et qualité de départ de chaque pilote */
  go() {
    const S = this.sim
    this.phase = 'racing'; this.lightsN = 0; this.goT = S.t
    S.leaderT.fill(NaN)
    for (const r of S.cars) {
      r.dist = -S.road(r.s, 0); r.laps = 0; r.lapT0 = NaN; r.secT0 = NaN; r.lastS = r.s; (r as Racer & { _pd?: number })._pd = r.dist
      if (r.player || r.out) continue
      r.mode = 'race'
      // réaction 0,18–0,30 s, rare calage (E : 0,3 %)
      const react = 0.18 + S.rng.next() * 0.12 + (S.rng.next() < 0.003 ? 4 : 0)
      r.err = { kind: 'launch', t: react }; r.v = 0
      if (react > 3) { this.msg(`${r.code} a calé sur la grille !`, 'info'); this.incident(r, r.s, 'stopped', 6) }
    }
    this.msg('EXTINCTION DES FEUX — c’est parti !', 'flag')
  }
  startFormation() {
    if (this.phase !== 'pre') return
    this.phase = 'formation'; this.gridT = 0
    for (const r of this.sim.cars) { (r as Racer & { _f0?: number })._f0 = r.dist; if (!r.player && !r.out) { r.mode = 'formation'; r.tyre.temp = 0.7 } }
    this.msg('FEUX VERTS — tour de formation (chauffe les pneus, pas de dépassement)', 'flag')
  }
  // ───────────── limitation de vitesse IA selon l'état de course
  speedCap(r: Racer, i: number, vt: number) {
    const S = this.sim
    if (r.err?.kind === 'launch') return 0
    if (this.phase === 'formation' || this.phase === 'gridding' || r.mode === 'formation') {
      vt = Math.min(vt * 0.7, 64)
      const ah = this.carAheadAny(r); if (ah && ah.mode !== 'grid') { const g = S.road(r.s, ah.s); vt = Math.min(vt, Math.max(0, ah.v + (g - 32) * 0.5)) }
      // place de grille : arrivée en douceur, arrêt sur la marque
      const slot = S.gridPos(r.slot), togo = S.road(r.s, slot.s), formDone = r.dist - ((r as Racer & { _f0?: number })._f0 ?? r.dist) > S.L * 0.6
      if (formDone && togo > -2 && togo < 260) { vt = Math.min(vt, Math.sqrt(2 * 4.5 * Math.max(0, togo - 0.2))); if (togo < 0.5 && r.v < 1) { r.mode = 'grid'; r.v = 0; r.d = slot.d; r.dist -= S.L } }
      return vt
    }
    if (this.red) { const vp = r.prof.v[i] * 0.45; return Math.min(vt, vp) }
    if (this.vsc) vt = Math.min(vt, r.prof.v[i] * 0.6)
    if (this.sc.active && !(this as RaceControl).isUnlapping(r) && r.wantPit === null) {
      vt = Math.min(vt, r.prof.v[i] * 0.66)
      const ah = this.carAheadAny(r, true)
      const gSC = this.sc.mode !== 'park' ? S.road(r.s, this.sc.s) : 1e9
      if (gSC > 0 && gSC < 600 && (!ah || S.road(r.s, ah.s) > gSC)) vt = Math.min(vt, Math.max(0, this.sc.v + (gSC - 45) * 0.5))
      else if (ah) { const g = S.road(r.s, ah.s); vt = Math.min(vt, Math.max(0, ah.v + (g - 28) * 0.5)) }
    }
    if (this.sc.active && this.isUnlapping(r)) vt = Math.min(vt, r.prof.v[i] * 0.8)
    // reprise après SC : pas de dépassement avant la ligne
    if (this.phase === 'chequered' && r.finished) vt = Math.min(vt, r.prof.v[i] * 0.55)
    const y = this.yellowAt(r.s)
    if (y === 'double') vt *= 0.7; else if (y === 'yellow') vt *= 0.88
    return vt
  }
  weave(r: Racer) { return (this.sc.active && !this.isUnlapping(r)) || (this.red && r.mode !== 'pit') }
  /** voiture devant sur la route, toutes voies confondues (pas de dépassement) */
  carAheadAny(r: Racer, ignorePit = false) {
    let best: Racer | null = null, g = 1e9
    for (const o of this.sim.cars) { if (o === r || !this.sim.onTrack(o) || (ignorePit && o.wantPit) || this.isUnlapping(o)) continue; const d = this.sim.road(r.s, o.s); if (d > 0 && d < g && d < 900) { g = d; best = o } }
    return best
  }
  isUnlapping(r: Racer) { return this.unlap && !!(r as Racer & { _unlap?: boolean })._unlap }
  mayOvertake(r: Racer, ahead: Racer) {
    if (this.phase !== 'racing' && this.phase !== 'session' && this.phase !== 'chequered') return false
    if (this.red || this.vsc || (this.sc.active && !this.isUnlapping(r))) return false
    if (this.yellowAt(r.s) || this.yellowAt(ahead.s)) return ahead.mode === 'spun' || ahead.mode === 'dnf' || !!ahead.err
    // reprise après SC : dépassement autorisé seulement après la ligne de contrôle
    if (this.restartHold && this.sim.road(r.s, 0) > 0 && this.sim.road(r.s, 0) < 2500) return false
    return true
  }
  restartHold = false
  drsGlobal() { return !this.red && !this.vsc && !this.sc.active && this.sim.wetness() < 0.3 && !this.restartHold }
  drsAllowed(r: Racer, gapT: number) {
    if (!this.drsGlobal()) return false
    if (this.sim.kind !== 'race') return r.mode === 'push'
    // course : à partir du 3e tour (2 tours après le départ ou une reprise), moins d'1 s à la détection (art. 22.2 / 2020)
    if (r.laps < 2 || this.sim.t - this.drsResumeT < 0) return false
    return gapT < 1.0
  }
  drsResumeT = 0
  /** drapeau bleu : `slow` va être doublé par `fast` qui a au moins un tour d'avance */
  isBlue(slow: Racer, fast: Racer) {
    if (this.sim.kind !== 'race' || this.phase !== 'racing' || this.sc.active || this.vsc) return false
    return fast.dist - slow.dist > this.sim.L * 0.5
  }
  // ───────────── SC
  private scLogic(dt: number) {
    const S = this.sim, C = this.sc, pr = C.prof!
    const i = S.idxOf(C.s)
    const ld = S.ordered().find(r => !r.out && S.onTrack(r))
    let vt = pr[i] * 0.9
    if (ld) { const gl = S.road(ld.s, C.s); if (gl > 0 && gl < 120) C.caught = true; if (C.mode === 'out' && gl > 0 && gl < 1500 && !C.caught) vt *= 0.75 }
    if (C.caught && C.mode === 'out') { C.mode = 'lead'; this.msg('La safety car a pris la tête de la course', 'rc') }
    // dédoublement : une fois la file formée (≥ ~1 tour derrière la SC)
    if (C.mode === 'lead' && !this.unlap && S.t > C.tEnd - 70) {
      const lead = S.leader(); let any = false
      for (const r of S.cars) { const lapped = !r.out && r !== lead && r.dist < lead.dist - S.L * 0.5 && S.road(lead.s, r.s) > 0 && S.road(lead.s, r.s) < 1500; (r as Racer & { _unlap?: boolean })._unlap = lapped && !r.player; if (lapped) any = true }
      this.unlap = true
      if (any) this.msg('LES VOITURES À UN TOUR PEUVENT SE DÉDOUBLER', 'rc')
    }
    if (this.unlap) { const lead = S.leader(); for (const r of S.cars) { const u = r as Racer & { _unlap?: boolean }; if (u._unlap && r.dist > lead.dist - S.L * 0.45) u._unlap = false } }
    const pending = S.cars.some(r => (r as Racer & { _unlap?: boolean })._unlap)
    if (C.mode === 'lead' && S.t > C.tEnd && !pending && !C.inThisLap && this.incidents.every(x => x.kind !== 'crash' || S.t > x.until)) {
      // annonce au passage de la ligne
      if (S.road(C.s, 0) > 0 && S.road(C.s, 0) < 200) { C.inThisLap = true; this.msg('SAFETY CAR RENTRE À LA FIN DE CE TOUR', 'rc') }
    }
    if (C.inThisLap) { C.lights = false; const toPit = S.road(C.s, S.pitEntryS); if (toPit > 0 && toPit < C.v * dt + 1) { C.mode = 'in'; C.pitP = 0 } }
    if (C.mode === 'in') { C.pitP += 22 * dt; C.v = 22; if (S.pitLen && C.pitP > S.pitLen * 0.4) { C.active = false; C.mode = 'park'; this.restartHold = true; this.drsResumeT = S.t + 2 * S.leader().prof.T; this.msg('Reprise : dépassements autorisés après la ligne de contrôle', 'rc') }
      this.scPose(); return }
    C.v = Math.max(0, C.v + Math.max(-12 * dt, Math.min(5.5 * dt, vt - C.v)))
    C.s = S.wrapS(C.s + C.v * dt); C.d += (S.line.e[i] - C.d) * Math.min(1, dt)
    this.scPose()
  }
  private scPose() {
    const S = this.sim, C = this.sc
    if (C.mode === 'in' && S.pit && S.pitCum) { const P = S.pit, k = S.pitIdx(Math.min(C.pitP, S.pitLen - 0.1)); C.wx = P.x[k]; C.wz = P.z[k]; const k1 = Math.min(P.n - 1, k + 1); const hx = P.x[k1] - P.x[k], hz = P.z[k1] - P.z[k], n = Math.hypot(hx, hz) || 1; C.hx = hx / n; C.hz = hz / n }
    else { const c = S.track.centre(C.s); C.wx = c.x - c.tz * C.d; C.wz = c.z + c.tx * C.d; C.hx = c.tx; C.hz = c.tz }
    C.wy = S.track.sample(C.wx, C.wz, S.idxOf(C.s), { h: 0, nx: 0, ny: 1, nz: 0, type: 1, s: 0, d: 0, i: -1 }).h
  }
  // ───────────── drapeau rouge
  private redLogic() {
    const S = this.sim
    if (S.kind !== 'race') {
      if (S.t > this.resumeAt && S.cars.every(r => r.player || r.mode === 'garage' || r.out)) { this.red = false; this.greenT = S.t + 10; this.msg('REPRISE DE LA SÉANCE — feu vert en sortie des stands', 'rc') }
      return
    }
    if (S.t > this.resumeAt && S.cars.every(r => r.player || r.out || r.mode === 'redq' || r.mode === 'pit' || r.mode === 'garage')) {
      const playerIn = S.player.out || S.player.inPit || S.player.mode === 'pit' || S.player.mode === 'redq'
      if (!playerIn && S.t < this.resumeAt + 70) return
      // reprise : départ arrêté sur la grille, dans l'ordre figé. Pas de tour de formation.
      this.red = false
      this.frozenOrder = null
      this.redOrder.forEach((r, k) => { r.slot = k })
      for (const r of S.cars) { if (r.out) continue; S.placeOnGrid(r); r.v = 0; if (!r.player) r.mode = 'grid' }
      this.phase = 'lights'; this.lightsT = 0; this.lightsN = 0; this.lightsHold = 0.6 + S.rng.next() * 1.6; this.gridT = 0
      this.jumpRef = { s: S.player.s, ok: true }
      this.placePlayerRequest = true
      this.msg('REPRISE : DÉPART ARRÊTÉ — ordre du drapeau rouge, cinq feux', 'rc')
    }
  }
  // ───────────── drapeaux bleus (3 postes sans céder → pénalité)
  private bluesLogic(dt: number) {
    const S = this.sim
    for (const r of S.cars) {
      if (r.out || !S.onTrack(r)) { this.blueFor.delete(r.i); continue }
      let fast: Racer | null = null
      for (const o of S.cars) { if (o === r || !S.onTrack(o)) continue; const g = S.road(o.s, r.s); if (g > 0 && g < Math.max(30, o.v * 1.0) && this.isBlue(r, o)) fast = o }
      if (!fast) { this.blueFor.delete(r.i); r.blueT = 0; continue }
      r.blueT += dt
      const b = this.blueFor.get(r.i) ?? { t: 0, posts: 0, warned: false }; b.t += dt
      const post = this.postBefore(r.s).n; if (this.lastPost.get(r.i) !== post) { this.lastPost.set(r.i, post); b.posts++ }
      if (b.posts >= 4 && !b.warned) { b.warned = true; this.caseNew(r, fast, 'drapeaux bleus ignorés', '5s', 'n’a pas cédé le passage après 3 postes (drapeaux bleus)', 6) }
      this.blueFor.set(r.i, b)
    }
  }
  // ───────────── panneaux lumineux et drapeaux par poste
  private panels() {
    const S = this.sim
    for (const p of this.posts) { p.panel = 'off'; p.flag = 'off' }
    if (this.phase === 'done' || (S.chequered && S.kind !== 'race')) { for (const p of this.posts) p.panel = 'off'; return }
    if (this.red) { for (const p of this.posts) { p.panel = 'red'; p.flag = 'red' } return }
    if (this.sc.active) { for (const p of this.posts) { p.panel = 'sc'; p.flag = 'yellow' } }
    else if (this.vsc) { for (const p of this.posts) { p.panel = 'vsc'; p.flag = 'yellow' } }
    else if (S.t < this.greenT) for (const p of this.posts) { p.panel = 'green'; p.flag = 'green' }
    // incidents : poste en amont + poste de l'incident (jaune / double jaune), vert au poste suivant
    for (const inc of this.incidents) {
      const a = this.postBefore(inc.s), b = this.postBefore(S.wrapS(inc.s - 1)), up = this.postBefore(S.wrapS(a.s - 1)), nx = this.postAfter(inc.s)
      for (const p of [up, a, b]) { if (p.panel !== 'sc' && p.panel !== 'vsc') p.panel = inc.sev; p.flag = inc.sev === 'double' ? 'double' : 'yellow' }
      if (!this.sc.active && !this.vsc && nx.panel === 'off') { nx.panel = 'green'; nx.flag = 'green' }
    }
    // bleu : poste juste devant la voiture qui va être doublée
    for (const r of S.cars) if (r.blueT > 0) { const p = this.postAfter(r.s); if (p.panel === 'off' || p.panel === 'green') { p.panel = 'blue'; p.flag = 'blue' } }
  }
  /** zone jaune / double jaune à l'abscisse s (du poste en amont de l'incident au poste qui suit) */
  yellowAt(s: number): 'yellow' | 'double' | null {
    const S = this.sim; let res: 'yellow' | 'double' | null = null
    for (const inc of this.incidents) {
      const up = this.postBefore(S.wrapS(this.postBefore(inc.s).s - 1)), nx = this.postAfter(inc.s)
      const a = S.road(up.s, s), len = S.road(up.s, nx.s)
      if (a >= 0 && a <= len) { if (inc.sev === 'double') return 'double'; res = 'yellow' }
    }
    return res
  }
  /** drapeau à afficher au joueur (volant / HUD), par priorité */
  playerFlag(): string {
    const S = this.sim, p = S.player
    if (this.red) return 'red'
    if (this.sc.active) return 'sc'
    if (this.vsc) return 'vsc'
    const y = this.yellowAt(p.s); if (y) return y === 'double' ? 'double' : 'yellow'
    if (p.blueT > 0) return 'blue'
    if (p.bw) return 'blackwhite'
    if (S.t < this.greenT) return 'green'
    return ''
  }
  // ───────────── incidents
  incident(r: Racer | null, s: number, kind: Incident['kind'], dur?: number) {
    const S = this.sim, onTrack = r ? Math.abs(r.d) < (r.d < 0 ? S.track.wl[r.idx] : S.track.wr[r.idx]) + 1 : true
    const sev: Incident['sev'] = kind === 'crash' || (kind === 'stopped' && onTrack) || (kind === 'spin' && onTrack) ? 'double' : 'yellow'
    const until = S.t + (dur ?? (kind === 'crash' ? 120 + S.rng.next() * 90 : kind === 'stopped' ? 60 + S.rng.next() * 40 : 12))
    this.incidents.push({ r, s, kind, sev, until, t: S.t })
    const where = `poste ${this.postBefore(s).n}`
    if (kind === 'spin') this.msg(`${r?.code ?? ''} en tête-à-queue (${where}) · ${sev === 'double' ? 'double drapeau jaune' : 'drapeau jaune'}`, 'flag')
    if (kind === 'crash' || kind === 'stopped') {
      this.msg(`${kind === 'crash' ? 'ACCIDENT' : 'VOITURE ARRÊTÉE'} : ${r?.code ?? ''} (${where}) · double drapeau jaune`, 'flag')
      // décision de la direction de course (E) : course → SC / VSC / jaunes ; essais-qualif → drapeau rouge pour une voiture dans le mur
      const x = S.rng.next()
      if (S.kind === 'race' && this.phase === 'racing') {
        const bad = this.incidents.filter(q => q.kind === 'crash' && S.t - q.t < 30).length
        if (kind === 'crash' && (bad >= 2 || x < 0.04)) this.redFlag(bad >= 2 ? 'plusieurs voitures accidentées' : 'barrière endommagée')
        else if (kind === 'crash' && x < 0.6) this.scDeploy(`accident de ${r?.code}`)
        else if (x < 0.85) this.vscDeploy(`${r?.code} arrêté en bord de piste`)
      } else if (S.kind !== 'race' && kind === 'crash') this.redFlag(`${r?.code} dans le mur`)
    }
  }
  clearIncident(r: Racer) { for (const inc of this.incidents.slice()) if (inc.r === r && inc.kind === 'spin') this.endIncident(inc) }
  private endIncident(inc: Incident) { this.incidents.splice(this.incidents.indexOf(inc), 1); if (inc.r?.mode === 'dnf') { inc.r.out = inc.r.out ?? 'Accident'; (inc.r as Racer & { _goneAt?: number })._goneAt = this.sim.t + 8 } if (!this.sc.active && !this.vsc && !this.red) this.msg(`Poste ${this.postBefore(inc.s).n} : piste dégagée, drapeau vert`, 'flag') }
  // ───────────── commissaires
  caseNew(a: Racer, b: Racer | null, what: string, pen: string, reason: string, delay = 20) {
    const S = this.sim
    const c: Case = { id: ++this.caseN, t: S.t, a, b, what, state: 'noted', tInv: S.t + 4 + S.rng.next() * 4, tDec: S.t + delay + S.rng.next() * delay, pen, reason }
    this.cases.push(c)
    this.msg(`INCIDENT NOTÉ — ${a.code}${b ? ' / ' + b.code : ''} · ${what}`, 'rc')
  }
  private stewards() {
    const S = this.sim
    for (const c of this.cases) {
      if (c.state === 'noted' && S.t > c.tInv) { c.state = 'invest'; this.msg(`SOUS ENQUÊTE — ${c.a.code} · ${c.what}`, 'rc') }
      if (c.state === 'invest' && S.t > c.tDec) { c.state = 'done'; this.decide(c) }
    }
  }
  private decide(c: Case) {
    const r = c.a, S = this.sim
    const P: Record<string, string> = { '5s': 'PÉNALITÉ DE 5 S', '10s': 'PÉNALITÉ DE 10 S', drive: 'DRIVE-THROUGH', sg: 'STOP-AND-GO 10 S', grid3: 'RECUL DE 3 PLACES SUR LA GRILLE', grid5: 'RECUL DE 5 PLACES SUR LA GRILLE', none: 'AUCUNE ACTION SUPPLÉMENTAIRE', warn: 'AVERTISSEMENT', del: 'TEMPS SUPPRIMÉ' }
    if (c.pen === '5s') r.pen += 5; else if (c.pen === '10s') r.pen += 10; else if (c.pen === 'drive') r.dtPend++; else if (c.pen === 'sg') r.sgPend++
    else if (c.pen === 'grid3') r.gridPen += 3; else if (c.pen === 'grid5') r.gridPen += 5
    if (c.pen === 'drive' || c.pen === 'sg') (r as Racer & { _dtLap?: number })._dtLap = r.laps + 3
    this.msg(`DÉCISION — ${r.code} : ${P[c.pen] ?? c.pen} (${c.reason})`, c.pen === 'none' ? 'rc' : 'pen')
    void S
  }
  /** collision : responsabilité (E, logique des commissaires 2020) — accrochage par l'arrière à forte vitesse relative,
   *  ou changement de trajectoire vers une voiture déjà à côté ; sinon incident de course */
  collision(rear: Racer, front: Racer, dv: number, side: boolean) {
    const S = this.sim
    if (S.kind !== 'race' || this.phase !== 'racing' && this.phase !== 'chequered') return
    const key = rear.i * 100 + front.i, last = (this as RaceControl & { _ck?: Map<number, number> })._ck ?? new Map<number, number>(); (this as RaceControl & { _ck?: Map<number, number> })._ck = last
    if ((last.get(key) ?? -99) > S.t - 5) return; last.set(key, S.t)
    const hurt = (r: Racer) => r.dmg.fw > 0.3 || r.tyre.punct > 0 || r.mode === 'spun' || !!r.out
    let culprit: Racer | null = null, victim: Racer | null = null
    if (!side && dv > 4 && !front.err) { culprit = rear; victim = front }
    else if (side) { const toward = (a: Racer, b: Racer) => (a.player ? a.lat : ((a as Racer & { _dr?: number })._dr ?? 0)) * Math.sign(b.d - a.d); const ta = toward(rear, front), tb = toward(front, rear); if (Math.max(ta, tb) > 0.9) { culprit = ta > tb ? rear : front; victim = culprit === rear ? front : rear } }
    if (!culprit) { if (dv > 5 || hurt(rear) || hurt(front)) this.caseNew(rear, front, 'contact', 'none', 'incident de course', 12); return }
    setTimeout(() => void 0, 0)
    const pen = hurt(victim!) ? '10s' : '5s'
    this.caseNew(culprit, victim, side ? 'collision (changement de trajectoire)' : 'collision par l’arrière', pen, 'a provoqué une collision')
  }
  impeding(r: Racer, victim: Racer) { if (this.sim.kind === 'qualifying') this.caseNew(r, victim, 'gêne en qualifications', 'grid3', `a gêné ${victim.code} dans son tour rapide`, 25) }
  trackLimits(r: Racer) {
    const S = this.sim
    if (S.kind !== 'race') { if (r.mode === 'push' || r.player) this.msg(`${r.code} : temps du tour SUPPRIMÉ (limites de piste)`, 'rc'); return }
    if (this.phase !== 'racing') return
    r.warnings++
    if (r.warnings <= 3) this.msg(`Limites de piste : ${r.code} · avertissement ${r.warnings}${r.warnings === 3 ? ' · DRAPEAU NOIR ET BLANC' : ''}`, 'rc')
    if (r.warnings === 3) r.bw = true
    if (r.warnings >= 4) { this.caseNew(r, null, 'limites de piste répétées', '5s', 'non-respect répété des limites de piste', 6); r.warnings = 2 }
  }
  /** état lu par les panneaux et par les outils : un poste, son drapeau, son panneau */
  marshalState(): { n: number; s: number; panel: Panel; flag: Panel }[] {
    return this.posts.map(p => ({ n: p.n, s: p.s, panel: p.panel, flag: p.flag }))
  }
  /** delta VSC : au-dessus du plafond pendant 2,5 s → 5 s, joueur et IA */
  vscOver(r: Racer, v: number, ref: number, dt: number) {
    if (!this.vsc || r.out) return
    const k = r as Racer & { _vsc?: number }
    k._vsc = v > ref + 3 ? (k._vsc ?? 0) + dt : Math.max(-20, (k._vsc ?? 0) - dt)
    if ((k._vsc ?? 0) > 2.5) { k._vsc = -20; this.caseNew(r, null, 'non-respect du delta VSC', this.sim.kind === 'race' ? '5s' : 'warn', 'trop rapide sous VSC', 8) }
  }
  pitSpeeding(r: Racer, v: number) { const k = r as Racer & { _ps?: number }; if (k._ps !== undefined && k._ps > this.sim.t - 20) return; k._ps = this.sim.t; this.caseNew(r, null, `excès de vitesse dans la voie des stands (${Math.round(v * 3.6)} km/h)`, this.sim.kind === 'race' ? '5s' : 'warn', 'limitation 80 km/h', 4) }
  /** ligne d'entrée ou de sortie coupée, ou feu de sortie grillé */
  pitLine(r: Racer, which: 'entrée' | 'sortie') {
    const k = r as Racer & { _pline?: number }
    if (k._pline !== undefined && k._pline > this.sim.t - 25) return
    k._pline = this.sim.t
    this.caseNew(r, null, `ligne de ${which} des stands`, this.sim.kind === 'race' ? '5s' : 'warn', which === 'sortie' && !this.pitExitGreen() ? 'feu de sortie rouge' : 'ligne coupée', 6)
  }
  /** libération du box : dangereuse si une voiture arrive dans la voie à moins de ~15 m */
  release(r: Racer) {
    this.boxLight = 'green'; this.boxGreenUntil = this.sim.t + 3
    const S = this.sim
    const near = S.cars.find(o => o !== r && o.mode === 'pit' && o.pitP < r.pitP && r.pitP - o.pitP < 15 && o.v > 10)
    if (near && S.rng.next() < 0.5) this.caseNew(r, near, 'libération dangereuse', S.kind === 'race' ? '5s' : 'grid3', 'libéré devant une voiture dans la voie des stands', 10)
  }
  pitOpenFor(_r: Racer) { return true }
  /** feu de sortie des stands : rouge si séance arrêtée / pas commencée, ou si le train de la SC passe */
  pitExitGreen() {
    const S = this.sim
    if (this.red && S.kind === 'race') return false
    if (this.red) return false
    if (S.kind === 'race' && (this.phase === 'pre' || this.phase === 'lights' || this.phase === 'gridding')) return false
    if (this.sc.active && S.pit) { const ex = S.wrapS(S.pit.s[S.pit.n - 1]); if (S.cars.some(r => S.onTrack(r) && S.road(r.s, ex) > 0 && S.road(r.s, ex) < 220)) return false }
    if (S.chequered && S.kind !== 'race') return false
    return true
  }
  pitEvent(r: Racer, io: 'in' | 'out') {
    if (io === 'in' && r.dtPend > 0) { r.dtPend--; r.boxP = -1; this.msg(`${r.code} purge son drive-through`, 'pen') }
    if (io === 'in' && this.sim.kind === 'race' && !r.player && r.wantPit && r.wantPit !== 'drive') this.msg(`${r.code} rentre au stand (${r.wantPit})`, 'team')
  }
  bestLap(r: Racer, T: number) {
    const S = this.sim
    if (!this.fastest || T < this.fastest.t) { const was = this.fastest; this.fastest = { r, t: T }; if (was && S.kind === 'race' && this.phase === 'racing') this.msg(`Meilleur tour : ${r.code} ${fmtT(T)}`, 'info') }
  }
  lapDone(r: Racer, _T: number, _valid: boolean) {
    const S = this.sim
    if (S.kind === 'race' && (this.phase === 'racing' || this.phase === 'chequered')) {
      const ld = S.leader()
      if (r === ld && r.laps >= S.laps && !S.chequered) { S.chequered = true; this.phase = 'chequered'; this.msg(`DRAPEAU À DAMIER — victoire de ${r.code}`, 'flag') }
      if (S.chequered && !r.finished) { r.finished = true; r.finishT = S.t; if (!r.player) r.mode = 'cool' }
      if (this.restartHold && r === ld) this.restartHold = false
      // drive-through / stop-and-go non purgé dans les 3 tours → drapeau noir
      const k = r as Racer & { _dtLap?: number }
      if ((r.dtPend > 0 || r.sgPend > 0) && k._dtLap !== undefined && r.laps > k._dtLap && !r.out) { r.out = 'Disqualifié (pénalité non purgée)'; r.mode = r.player ? r.mode : 'dnf'; this.msg(`DRAPEAU NOIR — ${r.code} disqualifié (pénalité non purgée)`, 'pen') }
      if (S.chequered && S.cars.every(c => c.finished || c.out)) this.phase = 'done'
    }
  }
  msg(text: string, kind: Msg['kind']) { const m = { t: this.sim.t, text, kind }; this.sim.msgs.push(m); if (this.sim.msgs.length > 60) this.sim.msgs.shift(); this.sim.onMsg?.(m) }
}
export function fmtT(t: number) { if (!isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}` }
void TYRE
