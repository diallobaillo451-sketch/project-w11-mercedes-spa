import { W11 } from './params.ts'
export type EngineMode = 'quali' | 'race' | 'save'
export type ErsMode = 'hotlap' | 'balanced' | 'charge' | 'overtake'
export const ENGINE_MODE_F: Record<EngineMode, number> = { quali: 1.0, race: 0.975, save: 0.93 } // E
const R = W11.wheelRadiusR
/** Rapports de transmission globaux (moteur → roue) déduits des vitesses cibles à 12 500 tr/min. */
export const GEAR_RATIOS: number[] = W11.gearTopKmh.map(k => (12500 * 2 * Math.PI / 60) / (k / 3.6 / R))
export const REVERSE_RATIO = GEAR_RATIOS[0] * 1.1

/** Débit carburant max réglementaire (kg/h) — FIA TR 2020 art. 5.1.4. */
export function fuelFlowMax(rpm: number): number { return rpm >= 10500 ? W11.fuelFlowMax : Math.max(0, 0.009 * rpm + 5.5) }
/** Rendement (E) : baisse à bas et très haut régime (frottements). */
export function iceEfficiency(rpm: number): number {
  let e = W11.iceEff
  if (rpm < 7000) e *= 0.82 + 0.18 * Math.max(0, (rpm - 4000) / 3000)
  if (rpm > 12300) { const x = (rpm - 12300) / 2700; e *= 1 - 0.16 * x * x }
  return e
}
/** Puissance du V6 (W) à un régime et une ouverture donnés. */
export function icePower(rpm: number, throttle: number, mode: EngineMode): number {
  const flow = fuelFlowMax(rpm) * throttleMap(throttle) / 3600
  return flow * W11.fuelLHV * iceEfficiency(rpm) * ENGINE_MODE_F[mode]
}
export function throttleMap(t: number): number { return t <= 0 ? 0 : Math.pow(t, 1.25) }
export function engineBrakeTorque(rpm: number): number { return -(25 + rpm * 0.0075) } // E, N·m vilebrequin

export class ERS {
  soc = 3.2e6            // J dans la batterie (fenêtre 4 MJ)
  deployedLap = 0        // J batterie → MGU-K ce tour (≤ 4 MJ)
  harvestedLap = 0       // J MGU-K → batterie ce tour (≤ 2 MJ)
  hToK = 0               // J MGU-H → MGU-K direct (illimité)
  mode: ErsMode = 'hotlap'
  kPower = 0             // W courant (+ déploiement, − récupération)
  hPower = 0
  /** Bilan du dernier tour complet (le compteur « ce tour » est remis à zéro à la ligne). */
  last = { deployed: 0, harvested: 0, hToK: 0 }
  newLap() { this.last = { deployed: this.deployedLap, harvested: this.harvestedLap, hToK: this.hToK }; this.deployedLap = 0; this.harvestedLap = 0; this.hToK = 0 }
  /** Déploiement demandé (W) sur l'arbre selon pédale et mode. */
  deploy(throttle: number, rpm: number, speed: number, dt: number): number {
    const hAvail = (throttle > 0.85 && rpm > 9000) ? W11.mguhPower * Math.min(1, (rpm - 9000) / 2500) * (this.mode === 'charge' ? 1 : 1) : 0
    this.hPower = hAvail
    let want = 0
    if (throttle > 0.9) {
      if (this.mode === 'hotlap' || this.mode === 'overtake') want = W11.mgukPower
      else if (this.mode === 'balanced') want = speed < 80 ? W11.mgukPower : W11.mgukPower * 0.35
    } else if (throttle > 0.6 && this.mode !== 'charge') want = W11.mgukPower * (throttle - 0.6) / 0.3 * 0.5
    const fromH = Math.min(want, hAvail)
    let fromES = want - fromH
    const esLeft = Math.min(this.soc, W11.esDeployLap - this.deployedLap)
    fromES = Math.max(0, Math.min(fromES, esLeft / dt))
    // surplus H → batterie
    const hSurplus = hAvail - fromH
    if (hSurplus > 0) this.soc = Math.min(W11.esCapacity, this.soc + hSurplus * dt * 0.95)
    this.soc -= fromES * dt; this.deployedLap += fromES * dt; this.hToK += fromH * dt
    this.kPower = fromH + fromES
    return this.kPower
  }
  /** Récupération au freinage / lever (W), renvoie la puissance réellement absorbée. */
  harvest(wantW: number, dt: number): number {
    const room = Math.min(W11.esCapacity - this.soc, W11.esHarvestLap - this.harvestedLap)
    const p = Math.max(0, Math.min(wantW, W11.mgukPower, room / dt))
    this.soc += p * dt * 0.92; this.harvestedLap += p * dt; this.kPower = -p
    return p
  }
}
