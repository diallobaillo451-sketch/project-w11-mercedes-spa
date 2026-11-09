/** Lot 8 C — format de qualification 2020 (règl. sportif art. 33) : Q1 (20 voitures, 5 éliminées), Q2 (15, 5 éliminées),
 *  Q3 (10) ; grille = Q3 puis Q2 11–15 puis Q1 16–20, pénalités de grille appliquées ensuite ; les 10 premiers partent
 *  avec les pneus de leur meilleur tour de Q2. Séance non disputée par le joueur (éliminé) : résultats approchés (E). */
import type { Weekend, SessionResult, WkSessionId } from './weekend.ts'
import { SPA_Q } from '../race/data.ts'
const ALL = Object.keys(SPA_Q)
type Cls = NonNullable<SessionResult['cls']>
const ranked = (c: Cls) => c.slice().sort((a, b) => (a.best ?? 1e9) - (b.best ?? 1e9))
/** pilotes éliminés avant la séance `id` */
export function excludedFor(wk: Weekend, id: WkSessionId): string[] {
  const out: string[] = []
  const q1 = wk.result('Q1')?.cls, q2 = wk.result('Q2')?.cls
  if ((id === 'Q2' || id === 'Q3') && q1) out.push(...ranked(q1).slice(15).map(x => x.id))
  if (id === 'Q3' && q2) out.push(...ranked(q2.filter(x => !out.includes(x.id))).slice(10).map(x => x.id))
  return out
}
/** séance simulée sans le joueur (il est éliminé) : temps réels Spa 2020 ± 0,25 % (E) */
export function approxSession(excl: string[], seed: number, scale = 1): Cls {
  let x = seed >>> 0; const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296 }
  return ALL.filter(id => !excl.includes(id)).map(id => ({ id, best: +(SPA_Q[id] * scale * (1 + (rnd() - 0.5) * 0.005)).toFixed(3) }))
}
/** grille de départ d'après Q1–Q3 + pénalités de grille */
export function startingGrid(wk: Weekend, player: string): string[] {
  const q1 = wk.result('Q1')?.cls, q2 = wk.result('Q2')?.cls, q3 = wk.result('Q3')?.cls
  if (!q1) return []
  const g: string[] = []
  if (q3) g.push(...ranked(q3).map(x => x.id))
  if (q2) for (const x of ranked(q2)) if (!g.includes(x.id)) g.push(x.id)
  for (const x of ranked(q1)) if (!g.includes(x.id)) g.push(x.id)
  for (const id of ALL) if (!g.includes(id)) g.push(id)
  if (!g.includes(player)) g.push(player)
  // pénalités de grille (cumulées sur le week-end), appliquées dans l'ordre du classement
  const pen: Record<string, number> = {}
  for (const r of wk.st.results) for (const [k, v] of Object.entries(r.gridPen ?? {})) pen[k] = (pen[k] ?? 0) + v
  const order = g.slice()
  for (const id of order) { const p = pen[id]; if (!p) continue; const i = g.indexOf(id); g.splice(i, 1); g.splice(Math.min(g.length, i + p), 0, id) }
  return g
}
