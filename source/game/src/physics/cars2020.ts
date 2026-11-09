/** Lot 8 B — physique par voiture 2020. Les écarts sont exprimés par rapport à la W11 (params.ts) et calibrés sur
 *  les qualifications de Spa 2020 (meilleur temps de l'équipe, Q1–Q3) et les vitesses officielles du week-end.
 *  Sources et raisonnement : docs/RESEARCH_CARS_2020.md. P = publié, E = estimation, C = calibré par simulation
 *  (tests/cars2020.test.ts : tour pilote automatique, ligne recalculée pour chaque voiture). */
import { W11 } from './params.ts'

export type PU = 'mercedes' | 'ferrari' | 'honda' | 'renault'
export interface CarPhys {
  id: string; team: string; pu: PU; chassis: string
  /** facteur sur la puissance du moteur thermique (rendement) — E, voir PU_POWER */
  ice: number
  ClA: number; CdA: number; aeroBalF: number
  massMin: number
  /** Spa 2020 : meilleur temps de qualification de l'équipe (s) et vitesse « speed trap » moyenne des 2 voitures (km/h) — P */
  spaQ: number; spaTrap: number; spaI1: number
}
/** puissance thermique relative 2020 (E, consensus presse : Mercedes réf. ; Honda ≈ −10 ch ; Renault ≈ −10 ch ;
 *  Ferrari ≈ −35 ch après l'accord confidentiel FIA / directives techniques de fin 2019 sur le débit carburant) */
export const PU_POWER: Record<PU, number> = { mercedes: 1.0, honda: 0.986, renault: 0.986, ferrari: 0.952 }
const mk = (id: string, team: string, pu: PU, chassis: string, ClA: number, CdA: number, spaQ: number, spaTrap: number, spaI1: number, aeroBalF = 0.405, massMin = 746): CarPhys =>
  ({ id, team, pu, chassis, ice: PU_POWER[pu], ClA, CdA, aeroBalF, massMin, spaQ, spaTrap, spaI1 })
// ClA / CdA : valeurs C (calibrées) — voir le tableau de validation dans docs/RESEARCH_CARS_2020.md
export const CARS2020: Record<string, CarPhys> = {
  w11:         mk('w11', 'mercedes', 'mercedes', 'Mercedes-AMG F1 W11 EQ Performance', 6.0, 1.45, 101.252, 307.9, 329.8),
  redbull:     mk('redbull', 'redbull', 'honda', 'Red Bull RB16', 5.894, 1.45, 101.778, 308.5, 327.8, 0.41),
  renault:     mk('renault', 'renault', 'renault', 'Renault R.S.20', 5.291, 1.37, 102.061, 313.0, 333.6),
  mclaren:     mk('mclaren', 'mclaren', 'renault', 'McLaren MCL35', 5.462, 1.44, 102.438, 311.8, 326.6),
  racingpoint: mk('racingpoint', 'racingpoint', 'mercedes', 'Racing Point RP20', 5.038, 1.39, 102.491, 312.0, 335.2),
  alphatauri:  mk('alphatauri', 'alphatauri', 'honda', 'AlphaTauri AT01', 4.96, 1.38, 102.730, 312.0, 335.3),
  ferrari:     mk('ferrari', 'ferrari', 'ferrari', 'Ferrari SF1000', 5.277, 1.40, 102.996, 307.7, 331.0),
  williams:    mk('williams', 'williams', 'mercedes', 'Williams FW43 (modèle 3D : FW42 2019)', 4.658, 1.41, 103.468, 308.2, 332.6),
  alfaromeo:   mk('alfaromeo', 'alfaromeo', 'ferrari', 'Alfa Romeo C39', 4.901, 1.40, 103.743, 306.9, 331.6),
  haas:        mk('haas', 'haas', 'ferrari', 'Haas VF-20', 4.881, 1.41, 103.838, 305.5, 329.0),
}
const BASE = JSON.parse(JSON.stringify(W11)) as typeof W11
const BASE_ICE = W11.iceEff
let cur = 'w11'
export const currentCar = () => cur
/** applique la voiture au modèle physique du joueur (W11 muté sur place : tout le code lit W11.* à l'exécution) */
export function applyCarPhysics(id: string) {
  const c = CARS2020[id] ?? CARS2020.w11
  Object.assign(W11, { ...BASE, tyre: W11.tyre })
  W11.iceEff = BASE_ICE * c.ice
  W11.ClA = c.ClA; W11.CdA = c.CdA; W11.aeroBalF = c.aeroBalF; W11.massMin = c.massMin
  cur = c.id
  return c
}
