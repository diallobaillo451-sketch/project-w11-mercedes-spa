/** Pilote des voitures physiques (IA « hybrides » : modèle Vehicle complet, physique de LEUR équipe).
 *  Base : l'autopilote de calibrage (physics/autopilot.ts, tour de référence validé à Spa) : mêmes lois de direction
 *  (poursuite de trajectoire à regard adaptatif, amortissement du lacet, contre-braquage, pas de braquage au-delà du pic de
 *  dérive) et même modulation freinage / accélérateur, au pas de 60 Hz. Ajouts propres au plateau :
 *   · écart latéral voulu par la direction de course (attaque, défense, céder le passage) LISSÉ en vitesse latérale : la
 *     consigne brute saute de plusieurs mètres, et un coup de volant brutal à 80 m/s = tête-à-queue ;
 *   · vitesse visée 0,25 s plus loin (freinage anticipé), déjà plafonnée par la simulation à ce que la voiture sait tenir ;
 *   · gouverneur d'adhérence : sous-virage, survirage ou sortie de piste → on lève le pied, retour progressif ;
 *   · détection de tête-à-queue, voiture immobilisée, épave → renvoyés à la simulation (drapeaux jaunes, SC, abandon). */
import type { Vehicle, Controls } from '../physics/vehicle.ts'
import type { RaceSim, Racer } from './sim.ts'
import { W11 } from '../physics/params.ts'

export interface DriveCmd { vt: number; vtLook?: number; dT: number; cap?: number }
export type PhysEvent = 'spin' | 'stuck' | 'wreck'

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
const fin = (x: number) => (Number.isFinite(x) ? x : 0)
/** accélérateur qui maintient la vitesse en palier (traînée ∝ v³, carte d'accélérateur ∝ t^1,25 ; ≈ 0,68 à 80 m/s) */
const holdThrottle = (v: number) => Math.min(0.85, Math.pow(0.62 * Math.pow(v / 80, 3), 0.8))

export class AiDriver {
  /** incident détecté : lu par HybridBank, transmis à RaceSim.physIncident */
  event: PhysEvent | null = null
  /** cap par rapport à la tangente de piste (rad, > 0 : vers la droite) */
  yaw = 0
  private dev = 0
  private devInit = false
  private bScale = 1
  private gS = 1
  private spinT = 0
  private stuckT = 0

  reset() { this.event = null; this.yaw = 0; this.dev = 0; this.devInit = false; this.bScale = 1; this.gS = 1; this.spinT = 0; this.stuckT = 0 }

  control(sim: RaceSim, r: Racer, car: Vehicle, cmd: DriveCmd, dt: number): Controls {
    const L = sim.line, T = sim.track, N = sim.N, ds = sim.ds
    const v = Math.max(0, car.forwardSpeed())
    const i = car.trackIdx
    const R = car.R
    const k240 = dt * 240 // les gains de l'autopilote sont calés par pas de 240 Hz

    // 1. écart latéral voulu par rapport à la ligne de course, lissé (vitesse latérale limitée)
    const goal = clamp(cmd.dT - L.e[i], -9, 9)
    if (!this.devInit) { this.dev = clamp(car.d - L.e[i], -9, 9); this.devInit = true }
    const rate = 1.0 + 0.03 * v
    this.dev += clamp((goal - this.dev) * Math.min(1, dt * 3), -rate * dt, rate * dt)

    // 2. direction : poursuite d'un point de la ligne (+ écart), regard raccourci dans les virages serrés
    const baseLook = 5 + v * 0.30
    let curveAhead = 0
    const samples = Math.max(1, Math.ceil(baseLook / 4))
    for (let q = 0; q <= samples; q++) curveAhead = Math.max(curveAhead, Math.abs(L.k[(i + Math.round(q * baseLook / samples / ds)) % N]))
    const look = Math.min(baseLook, 6 + 2.4 / Math.sqrt(Math.max(curveAhead, 0.002)))
    const j = (i + Math.round(look / ds)) % N
    const dAbs = clamp(L.e[j] + this.dev, -(T.wlR[j] - 0.9), T.wrR[j] - 0.9)
    const tx = L.x[j] - T.tz[j] * (dAbs - L.e[j]) - car.pos[0]
    const tz = L.z[j] + T.tx[j] * (dAbs - L.e[j]) - car.pos[2]
    const lx = tx * R[0] + tz * R[2], lz = tx * R[6] + tz * R[8]
    const alpha = Math.atan2(lx, -lz)
    const dist = Math.hypot(lx, lz)
    let delta = Math.atan(2 * W11.wheelbase * Math.sin(alpha) / Math.max(dist, 3))
    const vRef = car.setup.steerAssist >= 2 ? 26 : car.setup.steerAssist >= 1 ? 34 : 1e9
    const lock = W11.steerLock * Math.max(0.11, 1 / (1 + (v * v) / (vRef * vRef)))
    // amortissement du lacet
    const yawDes = -v * 2 * Math.sin(alpha) / Math.max(dist, 3)
    delta += (car.wb[1] - yawDes) * 0.04
    // contre-braquage : aligne les roues avant sur la trajectoire réelle quand l'arrière décroche
    const vr = car.vel[0] * R[0] + car.vel[2] * R[2], vf = -(car.vel[0] * R[6] + car.vel[2] * R[8])
    if (v > 8) delta += Math.atan2(vr, Math.max(vf, 3)) * 0.9
    // pas de braquage au-delà du pic de dérive avant (sinon sous-virage pur)
    const fl = car.wheels[0], fr = car.wheels[1], rl = car.wheels[2], rr = car.wheels[3]
    const aPk = W11.tyre.aPeak, aF = (fl.alpha + fr.alpha) / 2, aR = (rl.alpha + rr.alpha) / 2
    const kin = (fl.steer + fr.steer) / 2 + aF
    const aT = aPk * 1.1
    if (v > 12 && Math.sign(delta) === Math.sign(kin + Math.sign(delta) * aT)) {
      const dl = kin + Math.sign(delta) * aT
      if (Math.abs(delta) > Math.abs(dl)) delta = dl
    }
    const steer = clamp(delta / lock, -1, 1)

    // 3. vitesse : consigne de la simulation (0,25 s plus loin), gouverneur d'adhérence, hors piste
    const vCmd = cmd.vtLook ?? cmd.vt
    const latErr = Math.abs(car.d - clamp(L.e[i] + this.dev, -60, 60))
    const slipF = Math.abs(aF) / aPk, slipR = Math.abs(aR) / aPk
    const trouble = Math.max(0, slipF - 1.3) * 0.8 + Math.max(0, slipR - 1.2) * 1.2 + Math.max(0, latErr - 1.8) * 0.25
    if (trouble > 0 && v > 15) this.gS = Math.max(0.8, this.gS - trouble * dt * 1.5)
    else this.gS = Math.min(1, this.gS + dt * 0.05)
    let vt = vCmd * this.gS
    if (car.wheelsOut >= 3) vt = Math.min(vt, Math.max(14, Math.min(45, v - 3)))
    const err = vt - v
    let throttle = 0, brake = 0
    if (r.mode === 'spun' || r.err?.kind === 'launch') brake = 1
    else if (err > 0.3) throttle = Math.min(1, 0.55 + err * 0.5)
    else if (err < -1.2) brake = Math.min(1, -err * 0.16)
    else throttle = clamp(holdThrottle(v) + err * 0.2, 0, 1)
    // modulation pilote : pas de blocage et budget d'adhérence combiné en courbe
    const kF = Math.max(-fl.kappa, -fr.kappa)
    if (brake > 0 && kF > W11.tyre.kPeak * 0.85) this.bScale = Math.max(0.35, this.bScale - 0.01 * k240 * (kF / (W11.tyre.kPeak * 0.85)))
    else this.bScale = Math.min(1, this.bScale + 0.015 * k240)
    const lat = Math.min(1, slipF)
    brake *= this.bScale * Math.sqrt(Math.max(0.08, 1 - lat * lat * 0.9))
    const latR = Math.min(1, slipR)
    // hors trajectoire : on ne réaccélère pas tant que l'écart n'est pas résorbé
    if (latErr > 1.2 && lat > 0.8) throttle = Math.min(throttle, Math.max(0.15, 0.6 - 0.08 * latErr))
    if (latR > 0.6) throttle *= Math.max(0.3, 1 - (latR - 0.6) * 1.5)
    if (r.mode === 'out' || r.mode === 'cool' || r.mode === 'in') throttle = Math.min(throttle, 0.6)

    // 4. perte de contrôle, immobilisation, épave : la simulation prend le relais
    const fx = -R[6], fz = -R[8], tcx = T.tx[i], tcz = T.tz[i]
    this.yaw = Math.atan2(tcx * fz - tcz * fx, tcx * fx + tcz * fz)
    const D = car.damage
    if (D.wheelOff.some(x => x) || D.suspension.some(x => x > 0.85) || D.floor > 0.8 || D.total > 0.92 || car.flipped > 0.8) this.event = 'wreck'
    else {
      this.spinT = Math.abs(this.yaw) > 1.9 && v < 45 ? this.spinT + dt : Math.max(0, this.spinT - dt)
      this.stuckT = v < 1.5 && vCmd > 10 && r.err?.kind !== 'launch' ? this.stuckT + dt : Math.max(0, this.stuckT - dt)
      if (this.spinT > 0.3) this.event = 'spin'
      else if (this.stuckT > 4) this.event = 'stuck'
    }
    return { throttle: fin(Math.max(0, throttle)), brake: fin(brake), steer: fin(steer), drs: !!(r.drs && sim.inZone(r.s)), noReverse: true }
  }
}
