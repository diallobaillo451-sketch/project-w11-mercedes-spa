/** Championnat : calendrier des circuits dont on a les assets, points 2020, météo tirée
 *  (le joueur ne la choisit pas), aléas. Les manches sans piste jouable sont simulées. */
import { CIRCUITS, DRIVERS, carOfTeam, type Circuit } from '../data/drivers.ts'
import { CARS2020 } from '../physics/cars2020.ts'
import { POINTS, SKILL, SPA_Q } from '../race/data.ts'
import type { Weather } from './weekend.ts'

export interface RoundResult { circuit: string; pos: number; fl: boolean; dnf: boolean; simulated: boolean; weather: Weather }
export interface CareerState {
  v: 1; driver: string; round: number; seed: number; difficulty: number
  points: Record<string, number>; constructors: Record<string, number>
  results: RoundResult[]
}
const KEY = 'w11.career.v1'
export const careerCalendar = () => CIRCUITS.filter(c => c.career)

export function newCareer(driver: string, difficulty: number, seed = Date.now() & 0xffffff): CareerState {
  const points: Record<string, number> = {}; const constructors: Record<string, number> = {}
  for (const d of DRIVERS) points[d.id] = 0
  return { v: 1, driver, round: 0, seed, difficulty, points, constructors, results: [] }
}
export function saveCareer(c: CareerState) { try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* mode privé */ } }
export function loadCareer(): CareerState | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null') as CareerState | null; return s && s.v === 1 && s.driver ? s : null } catch { return null }
}
export function clearCareer() { try { localStorage.removeItem(KEY) } catch { /* */ } }

export class Rng {
  s: number
  constructor(seed: number) { this.s = seed >>> 0 || 1 }
  next() { let t = (this.s = (this.s + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** météo du week-end, tirée du climat du circuit */
export function rollWeather(c: Circuit, rng: Rng): Weather {
  const u = rng.next()
  if (u < c.rain * 0.45) return 'rain'
  if (u < c.rain) return c.rain > 0.25 ? 'wet' : 'damp'
  if (u < c.rain + 0.12) return 'damp'
  return 'dry'
}
/** aléas annoncés au départ (SC, averse, panne, drapeau rouge) — la course les joue vraiment quand la piste est là */
export function rollEvents(c: Circuit, rng: Rng): string[] {
  const ev: string[] = []
  if (rng.next() < 0.18 + c.rain * 0.25) ev.push('safety car')
  if (rng.next() < 0.1) ev.push('virtual safety car')
  if (rng.next() < c.rain * 0.55) ev.push('averse')
  if (rng.next() < 0.07) ev.push('drapeau rouge')
  if (rng.next() < 0.12) ev.push('panne mécanique')
  return ev
}

/** classement d'une manche non jouable : rythme 2020, difficulté du joueur, abandons rares */
export function simulateRound(st: CareerState, _circuit: Circuit): { id: string; pos: number; dnf: boolean; fl: boolean }[] {
  const rng = new Rng((st.seed + st.round * 997) >>> 0)
  const rows = DRIVERS.map(d => {
    const car = CARS2020[carOfTeam(d.team)] ?? CARS2020.w11
    const skill = SKILL[d.id]?.cons ?? 0.85
    let pace = (SPA_Q[d.id] ?? 104) * (car.spaQ / 101.252)
    if (d.id === st.driver) pace *= 1.06 - 0.1 * (st.difficulty / 100)
    pace *= 1 + (rng.next() - 0.5) * 0.012 * (1.4 - skill)
    const dnf = rng.next() < (d.id === st.driver ? 0.03 : 0.045)
    return { id: d.id, pace, dnf }
  }).sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || a.pace - b.pace)
  const fl = rows.find(r => !r.dnf)?.id ?? rows[0].id
  return rows.map((r, i) => ({ id: r.id, pos: i + 1, dnf: r.dnf, fl: r.id === fl }))
}

/** 25-18-15-12-10-8-6-4-2-1 + 1 pt du meilleur tour dans le top 10. Moitié si la course est arrêtée entre 2 tours et 75 %. */
export function award(st: CareerState, circuit: string, rows: { id: string; pos: number; dnf: boolean; fl: boolean }[], opts: { weather: Weather; simulated: boolean; half?: boolean }) {
  const scale = opts.half ? 0.5 : 1
  for (const r of rows) {
    if (r.dnf || r.pos > 10) continue
    const pts = (POINTS[r.pos - 1] ?? 0) * scale + (r.fl && r.pos <= 10 ? 1 : 0)
    st.points[r.id] = (st.points[r.id] ?? 0) + pts
    const team = DRIVERS.find(d => d.id === r.id)?.team ?? ''
    if (team) st.constructors[team] = (st.constructors[team] ?? 0) + pts
  }
  const me = rows.find(r => r.id === st.driver)
  st.results.push({ circuit, pos: me?.pos ?? 20, fl: !!me?.fl, dnf: !!me?.dnf, simulated: opts.simulated, weather: opts.weather })
  st.round++
  saveCareer(st)
}
export function table(points: Record<string, number>) {
  return Object.entries(points).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
export function playerPos(st: CareerState) { return table(st.points).findIndex(([id]) => id === st.driver) + 1 }
