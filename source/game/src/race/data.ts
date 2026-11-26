/** Lot 8 C — données du plateau 2020 pour l'IA. P = publié · E = estimation argumentée (docs/RESEARCH_RACE_2020.md). */

/** meilleur temps de qualification de chaque pilote à Spa 2020 (toutes parties Q1–Q3 confondues) — P (formula1.com) */
export const SPA_Q: Record<string, number> = {
  ham: 101.252, bot: 101.763, ver: 101.778, ric: 102.061, alb: 102.193, oco: 102.396, sai: 102.438, str: 102.491, per: 102.532, nor: 102.657,
  kvy: 102.730, gas: 102.745, lec: 102.996, vet: 103.261, rus: 103.468, rai: 103.743, gro: 103.838, gio: 103.950, lat: 104.138, mag: 104.314,
}
/** grille réelle de Spa 2020 (ordre de qualification) — P */
export const SPA_GRID = ['ham', 'bot', 'ver', 'ric', 'alb', 'oco', 'sai', 'per', 'str', 'nor', 'kvy', 'gas', 'lec', 'vet', 'rus', 'rai', 'gro', 'gio', 'lat', 'mag']
/** pole position réelle 2020 par circuit (référence de rythme) — P */
export const POLE_2020: Record<string, number> = { bel: 101.252, ita: 78.887, esp: 75.584, aut: 62.939, sty: 79.273, bhr: 87.264, hun: 73.447 }
/** profil pilote (E) : cons = régularité (erreurs), craft = science de la course (attaque/défense/départ),
 *  wet = aisance sous la pluie, tyre = gestion des pneus (dégradation ×). Échelle 0–1, ordres de grandeur tirés des
 *  classements 2020 (erreurs, dépassements, résultats sous la pluie), pas de données officielles. */
export interface Skill { cons: number; craft: number; wet: number; tyre: number }
const k = (cons: number, craft: number, wet: number, tyre: number): Skill => ({ cons, craft, wet, tyre })
export const SKILL: Record<string, Skill> = {
  ham: k(0.97, 0.96, 0.98, 0.97), bot: k(0.94, 0.86, 0.88, 0.93), ver: k(0.95, 0.97, 0.97, 0.93), alb: k(0.87, 0.84, 0.84, 0.88),
  lec: k(0.91, 0.93, 0.92, 0.88), vet: k(0.86, 0.88, 0.92, 0.9), nor: k(0.91, 0.9, 0.9, 0.9), sai: k(0.93, 0.91, 0.9, 0.92),
  ric: k(0.94, 0.96, 0.9, 0.93), oco: k(0.89, 0.87, 0.86, 0.9), per: k(0.93, 0.94, 0.9, 0.98), str: k(0.87, 0.85, 0.92, 0.9),
  gas: k(0.91, 0.91, 0.9, 0.9), kvy: k(0.89, 0.88, 0.89, 0.89), rai: k(0.94, 0.92, 0.92, 0.93), gio: k(0.86, 0.85, 0.85, 0.88),
  gro: k(0.85, 0.85, 0.86, 0.87), mag: k(0.87, 0.9, 0.86, 0.87), rus: k(0.92, 0.89, 0.92, 0.9), lat: k(0.85, 0.82, 0.84, 0.88),
}
/** temps d'immobilisation moyen à l'arrêt (s) — E d'après le classement DHL des arrêts 2020 (Red Bull et Mercedes devant) */
export const PIT_CREW: Record<string, number> = { redbull: 2.25, mercedes: 2.4, mclaren: 2.5, ferrari: 2.6, renault: 2.7, alphatauri: 2.65, racingpoint: 2.75, alfaromeo: 2.7, williams: 2.85, haas: 2.95 }
/** fiabilité (pannes / tour de course, E) : 2020 ≈ 1 abandon mécanique par course pour tout le plateau */
export const RELIAB: Record<string, number> = { mercedes: 0.0003, redbull: 0.0005, ferrari: 0.0004, mclaren: 0.0005, renault: 0.0006, alphatauri: 0.0005, racingpoint: 0.0004, alfaromeo: 0.0006, haas: 0.0008, williams: 0.0006 }
/** ordre des garages à Spa 2020 depuis l'entrée (FIA, plan du directeur de course ; repris de New Bot RECHERCHE_GARAGE.md) */
export const GARAGE_ORDER = ['mercedes', 'ferrari', 'redbull', 'mclaren', 'renault', 'alphatauri', 'racingpoint', 'alfaromeo', 'haas', 'williams']
/** Pirelli Spa 2020 : C2 dur / C3 medium / C4 tendre — P. Rythme et usure : E (ordres de grandeur Pirelli/presse :
 *  ≈ 0,5 s par cran de gomme à Spa, 1 arrêt prévu). `cliff` : tour à partir duquel la perte s'accélère. */
export type Comp = 'S' | 'M' | 'H' | 'I' | 'W'
export const COMP_NAME: Record<Comp, string> = { S: 'C4', M: 'C3', H: 'C2', I: 'INTER', W: 'PLUIE' }
export const COMP_COLOR: Record<Comp, string> = { S: '#ff3b30', M: '#ffd60a', H: '#f2f2f7', I: '#30d158', W: '#0a84ff' }
export const TYRE: Record<Comp, { delta: number; deg: number; cliff: number; warm: number }> = {
  S: { delta: 0, deg: 0.085, cliff: 13, warm: 0.9 }, M: { delta: 0.55, deg: 0.055, cliff: 23, warm: 0.75 }, H: { delta: 1.05, deg: 0.035, cliff: 33, warm: 0.6 },
  I: { delta: 9, deg: 0.06, cliff: 25, warm: 0.8 }, W: { delta: 14, deg: 0.05, cliff: 30, warm: 0.8 },
}
/** points 2020 : 25-18-15-12-10-8-6-4-2-1 + 1 pt meilleur tour (si dans le top 10) — P */
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
/** trois lettres officielles */
export const CODE = (id: string) => id.toUpperCase()
