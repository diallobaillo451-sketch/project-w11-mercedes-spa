/**
 * Pneus Pirelli P Zero / Cinturato 2020 (13") : formule magique normalisée + modèle d'état complet.
 *  - 5 composés secs C1–C5 (fenêtres de température P : Pirelli 2020 via motorsport.com) + intermédiaire et pluie.
 *  - Thermique 2 couches : surface (bande de roulement, réagit en ~1 s) et carcasse (≈ 30 s) ; 3 zones de surface
 *    (intérieur / milieu / extérieur) selon le carrossage et la charge latérale.
 *  - Pression à chaud = gaz parfait sur la température de carcasse ; optimum de pression (minimums Pirelli Spa P).
 *  - Dégradation : usure mécanique (abrasion ∝ puissance de glissement), dégradation thermique (surchauffe de surface),
 *    grainage (déchirement à froid, se résorbe en partie), cloquage (carcasse trop chaude, irréversible), plat (blocage),
 *    gommes ramassées (« pick-up »), saleté (sortie de piste), crevaison.
 * E = estimation calée sur des ordres de grandeur publics (Pirelli, F1 TV) ; non publié précisément.
 */
import { W11, type Compound } from './params.ts'
import type { TyreKind } from './env.ts'
const T = W11.tyre
const B = Math.tan(Math.PI / (2 * T.C))
/** Formule magique normalisée : pic = 1 à s = 1. */
export function mf(s: number): number { return Math.sin(T.C * Math.atan(B * s)) }

export interface TyreState {
  temp: number; core: number; wear: number; pressure: number; slipPower: number
  /** garage : pression à froid au-dessus du minimum Pirelli (psi) */
  pOff?: number
  /** températures de surface intérieur / milieu / extérieur (°C) */
  zones: [number, number, number]
  thermalDeg: number; graining: number; blister: number; flatSpot: number; pickup: number; dirt: number
  puncture: number // 0 intact → 1 à plat
  kind: TyreKind
}
export const kindOf = (c: Compound): TyreKind => c === 'I' ? 'inter' : c === 'W' ? 'wet' : 'slick'
export function newTyre(front: boolean, c: Compound = 'C4', blanket?: number): TyreState {
  const k = kindOf(c)
  const t = blanket ?? (k === 'slick' ? (front ? T.blanketF : T.blanketR) : k === 'inter' ? 60 : 60) // P 2020 : couvertures 100/80 °C slicks, 60 °C pluie/inter
  return { temp: t, core: t, wear: 0, pressure: front ? T.pColdF : T.pColdR, slipPower: 0, zones: [t, t, t], thermalDeg: 0, graining: 0, blister: 0, flatSpot: 0, pickup: 0, dirt: 0, puncture: 0, kind: k }
}
/** Facteur d'adhérence selon la température de surface / la fenêtre Pirelli du composé. */
export function tempFactor(temp: number, c: Compound): number {
  const [lo, hi] = T.window[c]
  if (temp < lo) { const x = (lo - temp) / 60; return Math.max(0.7, 1 - 0.3 * x * x - 0.04 * x) }
  if (temp > hi) { const x = (temp - hi) / 35; return Math.max(0.7, 1 - 0.22 * x * x) }
  return 1
}
/** μ de pic (sec, avant le multiplicateur de surface/eau). */
export function muPeak(fz: number, ty: TyreState, c: Compound, front: boolean): number {
  const load = Math.max(0.6, 1 - T.loadSens * (fz / (front ? T.fz0 : T.fz0 * 1.25) - 1)) // pneu AR plus large (405 vs 305 mm)
  const wearF = 1 - 0.18 * Math.min(1, ty.wear)
  const po = ty.pOff ?? 0, pOpt = (front ? T.pColdF : T.pColdR) * 1.12 + po * 1.12
  // (E) +1 psi : bande de roulement plus bombée → empreinte plus petite, ≈ −0,7 % d'adhérence (mais carcasse plus froide)
  const pF = (1 - 0.012 * Math.abs(ty.pressure - pOpt)) * (1 - 0.007 * po)
  const state = (1 - 0.06 * ty.thermalDeg) * (1 - 0.08 * ty.graining) * (1 - 0.1 * ty.blister) * (1 - 0.02 * ty.flatSpot) * (1 - 0.05 * ty.pickup) * (1 - 0.2 * ty.dirt)
  const punct = 1 - 0.72 * ty.puncture
  return T.mu0 * load * tempFactor(ty.temp, c) * T.gripC[c] * wearF * pF * state * punct
}
/** Thermique et dégradation, pas de temps dt. slipPower (W) ; rolling = travail de déformation ; lat = force latérale signée
 *  (N, + vers l'extérieur de la voiture pour cette roue) ; camber (rad, négatif) ; locked = roue bloquée ; wet = film d'eau (mm). */
export function tyreThermal(ty: TyreState, slipPower: number, speed: number, airT: number, trackT: number, dt: number, c: Compound, front: boolean, rolling: number,
  lat = 0, camber = 0, locked = false, wet = 0) {
  ty.slipPower = slipPower
  const kind = ty.kind
  // l'eau refroidit fortement la bande de roulement (évaporation) : pneus pluie gardés au chaud par leur gomme tendre (E)
  const wetCool = wet > 0.05 ? (2.5 + 6 * Math.min(1, wet)) * (kind === 'slick' ? 1.3 : kind === 'inter' ? 0.75 : 0.5) : 0
  const heat = (slipPower * T.heatGain * 0.001 + rolling * 0.0009) * (front ? T.frontHeat : 1) * (kind === 'slick' ? 1 : 1.35) * (1 - 0.035 * (ty.pOff ?? 0))
  const cool = (T.coolBase + T.coolSpeed * speed + wetCool) * (ty.temp - (airT * 0.6 + trackT * 0.4)) * 0.01
  ty.temp += (heat * 6 - cool - (ty.temp - ty.core) * 0.15) * dt / T.heatCap
  ty.core += (ty.temp - ty.core) * 0.06 * dt
  // 3 zones : le carrossage négatif charge l'épaule intérieure en ligne droite ; l'appui latéral charge l'épaule extérieure
  const tilt = Math.max(-1, Math.min(1, -camber / 0.06 * 0.6 - lat / 9000))
  const zt = [ty.temp + 7 * tilt, ty.temp + 2, ty.temp - 7 * tilt]
  for (let i = 0; i < 3; i++) ty.zones[i] += (zt[i] - ty.zones[i]) * Math.min(1, dt * 2)
  const [lo, hi] = T.window[c]
  // usure mécanique (abrasion) ; × usure du composé ; carcasse cloquée et surchauffe l'accélèrent
  ty.wear += slipPower * dt * 2.2e-9 * T.wearC[c] * (front ? 1.15 : 1) * (1 + ty.blister + 0.5 * Math.max(0, ty.temp - hi) / 20)
  // dégradation thermique : surface au-dessus de la fenêtre (irréversible, lente)
  if (ty.temp > hi + 5) ty.thermalDeg = Math.min(1, ty.thermalDeg + (ty.temp - hi - 5) * 4e-4 * dt)
  // grainage : glissement important sur une surface froide (sous la fenêtre) ; se résorbe (« clean up ») dans la fenêtre
  if (ty.temp < lo - 8 && slipPower > 25_000) ty.graining = Math.min(1, ty.graining + (lo - 8 - ty.temp) / 40 * slipPower * 1.5e-7 * dt * T.grainC[c])
  else if (ty.temp > lo && slipPower < 40_000) ty.graining = Math.max(0, ty.graining - 0.004 * dt)
  // cloquage : carcasse trop chaude (> haut de fenêtre + 12 °C), irréversible
  if (ty.core > hi + 12) ty.blister = Math.min(1, ty.blister + (ty.core - hi - 12) * 1.2e-3 * dt)
  // plat : roue bloquée en glissement → la gomme s'use en un point (irréversible, vibrations)
  if (locked && speed > 8) ty.flatSpot = Math.min(1, ty.flatSpot + speed * 9e-4 * dt * T.wearC[c])
  // pick-up et saleté se nettoient en roulant (plus vite si la gomme est chaude et glisse)
  ty.pickup = Math.max(0, ty.pickup - dt * (0.004 + slipPower * 3e-8))
  ty.dirt = Math.max(0, ty.dirt - dt * speed * 0.0009)
  // crevaison : la pression tombe en quelques secondes
  const cold = (front ? T.pColdF : T.pColdR) + (ty.pOff ?? 0)
  const tRef = front ? T.blanketF : T.blanketR
  ty.pressure = cold * (ty.core + 273) / (tRef + 273) * (1 - ty.puncture)
}
