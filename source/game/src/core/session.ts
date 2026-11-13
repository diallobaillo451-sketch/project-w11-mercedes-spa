/** Session de jeu (essais / qualification / contre-la-montre) : chronométrage, zones DRS, remise à zéro ERS par tour,
 *  limites de piste. Indépendant du rendu (testable sous Node). */
import { Timing } from '../timing/timing.ts'
import type { Vehicle } from '../physics/vehicle.ts'
import { CIRCUIT } from './circuit.ts'

/** Zones DRS du circuit actif (voir circuit.ts). */
export function drsZones(length: number): [number, number][] { return CIRCUIT.drs(length) }
export type SessionKind = 'practice' | 'qualifying' | 'timetrial' | 'race'
/** drapeaux FIA affichés sur le volant (LEDs latérales + écran) et dans le HUD */
export type Flag = 'none' | 'green' | 'yellow' | 'double' | 'red' | 'blue' | 'chequered' | 'blackwhite' | 'sc' | 'vsc'
export const FLAG_LABEL: Record<Flag, string> = { none: '', green: 'PISTE LIBRE', yellow: 'DRAPEAU JAUNE', double: 'DOUBLE JAUNE', red: 'DRAPEAU ROUGE', blue: 'DRAPEAU BLEU', chequered: 'DAMIER', blackwhite: 'AVERTISSEMENT LIMITES', sc: 'SAFETY CAR', vsc: 'VSC' }
export class Session {
  timing: Timing; zones: [number, number][]; kind: SessionKind
  inDrsZone = false; trackLimitTime = 0; warnings = 0
  flag: Flag = 'green'; private flagT = 4; private stopT = 0
  /** force un drapeau pendant `sec` secondes (démonstration, tests) */
  setFlag(f: Flag, sec = 6) { this.flag = f; this.flagT = sec }
  constructor(length: number, kind: SessionKind = 'timetrial') {
    const k = length / CIRCUIT.referenceLength
    const gates: [number, number] = [CIRCUIT.gates[0] * k, CIRCUIT.gates[1] * k]
    this.timing = new Timing(length, 1, gates[0], gates[1]); this.zones = drsZones(length); this.kind = kind
  }
  update(car: Vehicle, t: number, dt: number) {
    const s = car.s
    this.timing.update(s, t, dt)
    if (this.timing.events.includes('lap') || this.timing.events.includes('start')) {
      car.ers.newLap()
      // contre-la-montre : batterie considérée rechargée pendant le tour de sortie (simplification documentée)
      if (this.kind === 'qualifying' || this.kind === 'timetrial') car.ers.soc = Math.max(car.ers.soc, 3.6e6)
    }
    this.inDrsZone = this.zones.some(([a, b]) => s >= a && s <= b)
    // qualif / contre-la-montre : DRS libre dans les zones (règlement 2020, hors pluie)
    // course : DRS activé à partir du 3e tour (règl. sportif 2020, art. 22.2 ; seul en piste : pas de critère « 1 s »)
    car.drsAvailable = this.inDrsZone && (this.kind !== 'race' || this.timing.laps.length >= 2) && car.setup.drsAllowed !== false && (car.env?.wetness ?? 0) < 0.3 // piste mouillée : la direction de course désactive le DRS (règl. sportif F1 2020)
    // limites de piste : 4 roues hors (types herbe/gravier/eau) plus de 0,25 s → tour invalidé
    const off = car.wheels.every(w => w.type >= 4 || w.type === 0)
    this.trackLimitTime = off ? this.trackLimitTime + dt : 0
    if (this.trackLimitTime > 0.25 && this.timing.valid) { this.timing.invalidate(); this.warnings++; if (this.warnings >= 3) this.setFlag('blackwhite', 6) }
    // drapeaux : choc violent → double jaune ; voiture arrêtée / en tête-à-queue hors piste → jaune ; épave → rouge
    const dmg = (car as unknown as { damage?: { total: number } }).damage?.total ?? 0
    if (dmg > 0.85 && this.flag !== 'red') this.setFlag('red', 10)
    else if (car.impact > 0.55 && this.flag !== 'red') this.setFlag('double', 8)
    this.stopT = (car.speed < 8 && off) ? this.stopT + dt : 0
    if (this.stopT > 1.5 && this.flag !== 'red' && this.flag !== 'double') this.setFlag('yellow', 5)
    if (this.timing.events.includes('lap')) this.setFlag(this.kind === 'timetrial' ? 'chequered' : this.kind === 'race' ? 'none' : 'green', 3)
    if (this.flagT > 0) { this.flagT -= dt; if (this.flagT <= 0) this.flag = 'none' }
  }
}
