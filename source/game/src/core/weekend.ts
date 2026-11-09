/** Week-end de Grand Prix (solo) : programme EL1-EL3 / Q1-Q3 / course, chronos de session, télémétrie de séance,
 *  propositions de l'ingénieur, résultats, sauvegarde locale. Sans DOM ni rendu (testable sous Node).
 *  ⚠ Plateau IA non implémenté : `GridHooks` est le point d'entrée prévu (voir STATUS.md). */
import type { Setup } from '../physics/vehicle.ts'
import type { Compound } from '../physics/params.ts'
import type { SessionKind } from './session.ts'

export type WkSessionId = 'FP1' | 'FP2' | 'FP3' | 'Q1' | 'Q2' | 'Q3' | 'RACE'
export const WK_LABEL: Record<WkSessionId, string> = { FP1: 'Essais libres 1', FP2: 'Essais libres 2', FP3: 'Essais libres 3', Q1: 'Qualifications 1', Q2: 'Qualifications 2', Q3: 'Qualifications 3', RACE: 'Course' }
export const WK_SHORT: Record<WkSessionId, string> = { FP1: 'EL1', FP2: 'EL2', FP3: 'EL3', Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', RACE: 'COURSE' }
export const WK_DAY: Record<WkSessionId, string> = { FP1: 'Vendredi', FP2: 'Vendredi', FP3: 'Samedi', Q1: 'Samedi', Q2: 'Samedi', Q3: 'Samedi', RACE: 'Dimanche' }
export const WK_ORDER: WkSessionId[] = ['FP1', 'FP2', 'FP3', 'Q1', 'Q2', 'Q3', 'RACE']
/** durées réelles 2020 : EL1/EL2 90 min (60 min en 2021), EL3 60 min, Q1 18 / Q2 15 / Q3 12 min */
export const REAL_MIN: Record<WkSessionId, number> = { FP1: 90, FP2: 90, FP3: 60, Q1: 18, Q2: 15, Q3: 12, RACE: 0 }
export type Weather = 'dry' | 'damp' | 'wet' | 'rain'
export interface WeekendPlan {
  circuit: string; car: string; driver: string
  fpMin: [number, number, number]; qMin: [number, number, number]; raceLaps: number
  weather: Weather; damage: 'off' | 'visual' | 'real'
  /** séances sautées (ex. un week-end « court » : EL3 + qualifs + course) */
  skip: WkSessionId[]
}
export interface SessionResult {
  id: WkSessionId; best: number | null; sectors: number[] | null; bestSectors: number[]; laps: number; valid: number; vmax: number; total?: number
  lapTimes: number[]; penalties: number; dnf?: boolean; pos: number
}
export interface Telemetry {
  n: number; tF: number; tR: number; tMaxF: number; tMaxR: number; vmax: number; lockups: number; scrapeT: number; snapRear: number; pushFront: number
  brakeMax: number; laps: number; distance: number
}
export const newTelemetry = (): Telemetry => ({ n: 0, tF: 0, tR: 0, tMaxF: 0, tMaxR: 0, vmax: 0, lockups: 0, scrapeT: 0, snapRear: 0, pushFront: 0, brakeMax: 0, laps: 0, distance: 0 })
/** échantillon par image (ce que voit l'ingénieur sur l'écran télémétrie) */
export interface TeleSample { speed: number; tyreT: [number, number, number, number]; brakeT: number; locking: boolean; scrape: number; alphaF: number; alphaR: number; steer: number; dt: number }
export function sampleTelemetry(T: Telemetry, s: TeleSample, lockPrev: boolean) {
  T.vmax = Math.max(T.vmax, s.speed); T.distance += s.speed * s.dt; T.brakeMax = Math.max(T.brakeMax, s.brakeT)
  if (s.locking && !lockPrev) T.lockups++
  if (s.scrape > 0.25 && s.speed > 50) T.scrapeT += s.dt
  if (s.speed > 30) {
    const f = (s.tyreT[0] + s.tyreT[1]) / 2, r = (s.tyreT[2] + s.tyreT[3]) / 2
    T.n++; T.tF += f; T.tR += r; T.tMaxF = Math.max(T.tMaxF, f); T.tMaxR = Math.max(T.tMaxR, r)
    // équilibre en courbe : glissement AR > AV → survireur ; AV > AR avec volant braqué → sous-vireur
    if (Math.abs(s.alphaR) > Math.abs(s.alphaF) + 0.035 && Math.abs(s.alphaR) > 0.07) T.snapRear += s.dt
    else if (Math.abs(s.alphaF) > Math.abs(s.alphaR) + 0.03 && Math.abs(s.steer) > 0.25) T.pushFront += s.dt
  }
}
export interface Proposal { key: keyof Setup | 'fuel'; label: string; from: number | string; to: number | string; why: string; work: number; on: boolean }
/** fenêtres Pirelli (°C de surface) pour l'analyse de l'ingénieur */
const WIN: Record<string, [number, number]> = { C1: [100, 130], C2: [95, 125], C3: [90, 120], C4: [85, 115], C5: [80, 110], I: [45, 80], W: [40, 70] }
export const fmtWing = (v: number) => String(v)
/** temps de travail des mécaniciens (min, valeurs d'ordre de grandeur des équipes) */
export const WORK_MIN: Partial<Record<keyof Setup | 'fuel', number>> = { wingF: 2, wingR: 6, rideF: 12, rideR: 12, diffOn: 1, diffOff: 1, brakeBias: 0.5, pressF: 4, pressR: 4, compound: 3, fuel: 4 }
/** propositions de réglage d'après la séance (règles d'ingénieur, E : seuils de bon sens, pas des données d'équipe) */
export function engineerProposals(T: Telemetry, S: Setup, next: WkSessionId, weather: Weather, fuel: number, raceLaps: number): { text: string; list: Proposal[] } {
  const L: Proposal[] = [], cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  const add = (key: Proposal['key'], label: string, from: number | string, to: number | string, why: string) => { if (from !== to) L.push({ key, label, from, to, why, work: WORK_MIN[key] ?? 2, on: true }) }
  const wet = weather === 'rain' || weather === 'wet'
  const comp = S.compound as Compound
  let text: string
  if (T.n < 300) {
    text = 'On n’a pas encore assez de données. Fais quelques tours propres, je regarde la télémétrie à ton retour.'
    if (wet && !(comp === 'I' || comp === 'W')) add('compound', 'Pneus', comp, weather === 'rain' ? 'W' : 'I', 'Piste mouillée : il faut des pneus pluie.')
  } else {
    const f = T.tF / T.n, r = T.tR / T.n, w = WIN[comp] ?? [90, 120]
    const notes: string[] = []
    if (T.snapRear > T.pushFront * 1.6 && T.snapRear > 4) {
      notes.push('l’arrière décroche en courbe'); add('wingR', 'Aileron AR', S.wingR, cl(S.wingR + 1, 1, 11), 'Survireur : plus d’appui AR pour stabiliser Pouhon et Blanchimont.')
      add('diffOff', 'Diff. entrée', Math.round(S.diffOff * 10), Math.round(cl(S.diffOff + 0.1, 0, 1) * 10), 'Diff plus bloqué à l’entrée : arrière plus stable au freinage.')
    } else if (T.pushFront > T.snapRear * 1.6 && T.pushFront > 4) {
      notes.push('la voiture sous-vire'); add('wingF', 'Aileron AV', S.wingF, cl(S.wingF + 1, 1, 11), 'Sous-vireur : un cran d’aileron AV pour la rotation à La Source et aux Combes.')
      add('diffOn', 'Diff. sortie', Math.round(S.diffOn * 10), Math.round(cl(S.diffOn - 0.1, 0, 1) * 10), 'Diff plus ouvert en sortie : moins de poussée de l’AV à la remise des gaz.')
    } else notes.push('l’équilibre est bon')
    const vk = T.vmax * 3.6
    if (!wet && vk < 322 && T.snapRear < 6) { notes.push(`vitesse de pointe ${Math.round(vk)} km/h, un peu faible`); add('wingR', 'Aileron AR', S.wingR, cl(S.wingR - 1, 1, 11), 'Kemmel : on perd en ligne droite, un cran d’aileron AR en moins.') }
    if (T.scrapeT > 3) { notes.push('le fond frotte trop'); add('rideR', 'Hauteur AR', S.rideR, cl(S.rideR + 2, -4, 10), 'Le fond touche à l’Eau Rouge : +2 mm à l’arrière.'); add('rideF', 'Hauteur AV', S.rideF, cl(S.rideF + 1, -4, 10), 'Et +1 mm à l’avant pour garder la plate-forme.') }
    else if (T.scrapeT < 0.3 && T.n > 2000 && !wet) add('rideR', 'Hauteur AR', S.rideR, cl(S.rideR - 1, -4, 10), 'Le fond ne touche jamais : on peut descendre l’AR d’1 mm pour l’appui.')
    if (f > w[1] || r > w[1]) { notes.push('pneus trop chauds'); if (f > w[1]) add('pressF', 'Pression AV', S.pressF, cl(S.pressF + 0.5, 0, 3), 'AV au-dessus de la fenêtre : +0,5 psi refroidit la carcasse.'); if (r > w[1]) add('pressR', 'Pression AR', S.pressR, cl(S.pressR + 0.5, 0, 3), 'AR au-dessus de la fenêtre : +0,5 psi.') }
    else if ((f < w[0] || r < w[0]) && (S.pressF > 0 || S.pressR > 0)) { notes.push('pneus un peu froids'); add('pressF', 'Pression AV', S.pressF, cl(S.pressF - 0.5, 0, 3), 'Sous la fenêtre : on revient vers le minimum Pirelli.'); add('pressR', 'Pression AR', S.pressR, cl(S.pressR - 0.5, 0, 3), 'Idem à l’arrière.') }
    if (T.lockups >= 3) { notes.push(`${T.lockups} blocages de roue`); add('brakeBias', 'Répartition', +(S.brakeBias * 100).toFixed(1), +(cl(S.brakeBias - 0.01, 0.5, 0.65) * 100).toFixed(1), 'Trop de blocages AV : répartition 1 % vers l’arrière.') }
    text = `Bon run. D’après la télémétrie : ${notes.join(', ')}. Pneus AV ${Math.round(f)} °C, AR ${Math.round(r)} °C (fenêtre ${w[0]}–${w[1]} °C).`
  }
  // programme de la séance suivante
  if (!wet) {
    if (next.startsWith('Q')) { add('compound', 'Pneus', comp, 'C4', 'Qualif : le tendre C4 pour le tour rapide.'); add('fuel', 'Carburant', Math.round(fuel), 8, 'Juste ce qu’il faut pour un tour de sortie, un tour lancé et le retour.') }
    else if (next === 'RACE') { add('compound', 'Pneus', comp, 'C3', 'Départ en mediums C3 : plus de marge pour le premier relais.'); add('fuel', 'Carburant', Math.round(fuel), Math.min(110, Math.round(2.45 * raceLaps + 2)), `Plein pour ${raceLaps} tours (≈ 2,45 kg/tour à Spa).`) }
  }
  return { text, list: dedupe(L) }
}
function dedupe(L: Proposal[]) { const m = new Map<string, Proposal>(); for (const p of L) m.set(p.key, m.has(p.key) ? { ...p, from: m.get(p.key)!.from } : p); return [...m.values()].filter(p => p.from !== p.to) }
/** applique une proposition au réglage (valeurs affichées → unités internes) */
export function applyProposal(S: Setup, p: Proposal, setFuel: (kg: number) => void) {
  const v = p.to
  if (p.key === 'fuel') setFuel(Number(v))
  else if (p.key === 'diffOn' || p.key === 'diffOff') (S as unknown as Record<string, number>)[p.key] = Number(v) / 10
  else if (p.key === 'brakeBias') S.brakeBias = Number(v) / 100
  else if (p.key === 'compound') S.compound = v as Compound
  else (S as unknown as Record<string, number | string>)[p.key] = v
}
export const sessionKind = (id: WkSessionId): SessionKind => id === 'RACE' ? 'race' : id.startsWith('Q') ? 'qualifying' : 'practice'
export const sessionMinutes = (P: WeekendPlan, id: WkSessionId) => id.startsWith('FP') ? P.fpMin[+id[2] - 1] : id.startsWith('Q') ? P.qMin[+id[1] - 1] : 0

/** points d'accroche du futur plateau IA (19 adversaires) : non branchés dans ce lot */
export interface GridHooks {
  /** classement d'une séance chronométrée (le joueur seul aujourd'hui) */
  classify?: (id: WkSessionId, player: SessionResult) => { driver: string; best: number | null; gap: number | null }[]
  /** grille de départ d'après Q1-Q3 */
  startingGrid?: () => string[]
}
export const gridHooks: GridHooks = {}

const KEY = 'w11.weekend.v1'
export interface WeekendState { plan: WeekendPlan; idx: number; results: SessionResult[]; started: number; fuel: number; /** chrono restant de la séance en cours (s) */ rem?: number }
export class Weekend {
  st: WeekendState
  constructor(st: WeekendState) { this.st = st }
  static create(plan: WeekendPlan): Weekend { const w = new Weekend({ plan, idx: 0, results: [], started: Date.now(), fuel: 30 }); w.skipForward(); w.save(); return w }
  static load(): Weekend | null { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null') as WeekendState | null; return s && s.plan && s.idx < WK_ORDER.length ? new Weekend(s) : null } catch { return null } }
  static clear() { try { localStorage.removeItem(KEY) } catch { /* */ } }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.st)) } catch { /* */ } }
  get cur(): WkSessionId { return WK_ORDER[Math.min(this.st.idx, WK_ORDER.length - 1)] }
  get next(): WkSessionId | null { for (let i = this.st.idx + 1; i < WK_ORDER.length; i++) if (!this.st.plan.skip.includes(WK_ORDER[i])) return WK_ORDER[i]; return null }
  get done() { return this.st.idx >= WK_ORDER.length }
  private skipForward() { while (this.st.idx < WK_ORDER.length && this.st.plan.skip.includes(WK_ORDER[this.st.idx])) this.st.idx++ }
  finish(r: SessionResult) { this.st.results = this.st.results.filter(x => x.id !== r.id); this.st.results.push(r); this.st.idx++; this.skipForward(); this.save() }
  result(id: WkSessionId) { return this.st.results.find(r => r.id === id) ?? null }
  /** meilleur temps de qualif (Q3 sinon Q2 sinon Q1) : place sur la grille = 1 tant qu'il n'y a pas d'IA */
  qualiBest(): number | null { for (const id of ['Q3', 'Q2', 'Q1'] as const) { const r = this.result(id); if (r?.best) return r.best } return null }
}
export function defaultPlan(driver: string): WeekendPlan {
  return { circuit: 'bel', car: 'w11', driver, fpMin: [20, 20, 15], qMin: [12, 10, 8], raceLaps: 10, weather: 'dry', damage: 'real', skip: [] }
}
