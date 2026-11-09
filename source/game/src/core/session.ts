/** Session de jeu (essais / qualification / contre-la-montre) : chronométrage, zones DRS, remise à zéro ERS par tour,
 *  limites de piste. Indépendant du rendu (testable sous Node). */
import { Timing } from '../timing/timing.ts'
import type { Vehicle } from '../physics/vehicle.ts'

/** Zones DRS de Spa 2020 (E : positions estimées sur notre ligne centrale ; 2 zones : Kemmel, ligne droite des stands). */
export function drsZones(length: number): [number, number][] {
  const k = length / 7001.7
  return [[1380 * k, 2230 * k], [6790 * k, length], [0, 190 * k]]
}
export type SessionKind = 'practice' | 'qualifying' | 'timetrial'
export class Session {
  timing: Timing; zones: [number, number][]; kind: SessionKind
  inDrsZone = false; trackLimitTime = 0; warnings = 0
  constructor(length: number, kind: SessionKind = 'timetrial') {
    this.timing = new Timing(length); this.zones = drsZones(length); this.kind = kind
  }
  update(car: Vehicle, t: number, dt: number) {
    const s = car.s
    this.timing.update(s, t, dt)
    if (this.timing.events.includes('lap') || this.timing.events.includes('start')) {
      car.ers.newLap()
      // contre-la-montre : batterie considérée rechargée pendant le tour de sortie (simplification documentée)
      if (this.kind !== 'practice') car.ers.soc = Math.max(car.ers.soc, 3.6e6)
    }
    this.inDrsZone = this.zones.some(([a, b]) => s >= a && s <= b)
    // qualif / contre-la-montre : DRS libre dans les zones (règlement 2020, hors pluie)
    car.drsAvailable = this.inDrsZone && car.setup.drsAllowed !== false
    // limites de piste : 4 roues hors (types herbe/gravier/eau) plus de 0,25 s → tour invalidé
    const off = car.wheels.every(w => w.type >= 4 || w.type === 0)
    this.trackLimitTime = off ? this.trackLimitTime + dt : 0
    if (this.trackLimitTime > 0.25 && this.timing.valid) { this.timing.invalidate(); this.warnings++ }
  }
}
