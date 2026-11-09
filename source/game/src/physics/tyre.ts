import { W11, type Compound } from './params.ts'
const T = W11.tyre
const B = Math.tan(Math.PI / (2 * T.C))
/** Formule magique normalisée : pic = 1 à s = 1. */
export function mf(s: number): number { return Math.sin(T.C * Math.atan(B * s)) }

export interface TyreState {
  temp: number; core: number; wear: number; pressure: number; slipPower: number
}
export function newTyre(front: boolean): TyreState {
  const t = front ? T.blanketF : T.blanketR
  return { temp: t, core: t, wear: 0, pressure: front ? T.pColdF : T.pColdR, slipPower: 0 }
}
/** Facteur d'adhérence selon la température de surface / la fenêtre Pirelli du composé. */
export function tempFactor(temp: number, c: Compound): number {
  const [lo, hi] = T.window[c]
  if (temp < lo) { const x = (lo - temp) / 60; return Math.max(0.72, 1 - 0.3 * x * x - 0.04 * x) }
  if (temp > hi) { const x = (temp - hi) / 35; return Math.max(0.7, 1 - 0.22 * x * x) }
  return 1
}
export function muPeak(fz: number, ty: TyreState, c: Compound, front: boolean): number {
  const load = Math.max(0.6, 1 - T.loadSens * (fz / (front ? T.fz0 : T.fz0 * 1.25) - 1)) // pneu AR plus large (405 vs 305 mm)
  const wearF = 1 - 0.18 * Math.min(1, ty.wear)
  const pOpt = front ? T.pColdF * 1.12 : T.pColdR * 1.12
  const pF = 1 - 0.012 * Math.abs(ty.pressure - pOpt)
  return T.mu0 * load * tempFactor(ty.temp, c) * T.gripC[c] * wearF * pF
}
/** Thermique simplifiée : surface + carcasse, chauffe par puissance de glissement, refroidissement par la vitesse. */
export function tyreThermal(ty: TyreState, slipPower: number, speed: number, airT: number, trackT: number, dt: number, c: Compound, front: boolean, rolling: number) {
  ty.slipPower = slipPower
  const heat = (slipPower * T.heatGain * 0.001 + rolling * 0.0009) * (front ? T.frontHeat : 1)
  const cool = (T.coolBase + T.coolSpeed * speed) * (ty.temp - (airT * 0.6 + trackT * 0.4)) * 0.01
  ty.temp += (heat * 6 - cool - (ty.temp - ty.core) * 0.15) * dt / T.heatCap
  ty.core += (ty.temp - ty.core) * 0.06 * dt
  ty.wear += slipPower * dt * 2.2e-9 * T.wearC[c] * (front ? 1.15 : 1)
  const cold = front ? T.pColdF : T.pColdR
  const tRef = front ? T.blanketF : T.blanketR
  ty.pressure = cold * (ty.core + 273) / (tRef + 273) * 1.0 + 0.0
}
