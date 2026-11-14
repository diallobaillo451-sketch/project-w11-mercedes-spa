/** Pilote automatique (tests de calibration, démo, fantôme) : poursuite pure + profil de vitesse. */
import type { Vehicle, Controls } from './vehicle.ts'
import type { RacingLine } from '../track/racingLine.ts'
import { W11 } from './params.ts'
export class Autopilot {
  line: RacingLine; pace: number
  private yawI = 0
  private bScale = 1
  private gS = 1
  constructor(line: RacingLine, pace = 1) { this.line = line; this.pace = pace }
  reset() { this.yawI = 0; this.bScale = 1; this.gS = 1 }
  control(car: Vehicle): Controls {
    const L = this.line, N = L.N
    const v = Math.max(0, car.forwardSpeed())
    const i = car.trackIdx
    const baseLook = 5 + v * 0.30
    let curveAhead = 0
    const samples = Math.max(1, Math.ceil(baseLook / 4))
    for (let q = 0; q <= samples; q++) {
      const k = (i + Math.round(q * baseLook / samples / L.ds)) % N
      curveAhead = Math.max(curveAhead, Math.abs(L.k[k]))
    }
    const look = Math.min(baseLook, 6 + 2.4 / Math.sqrt(Math.max(curveAhead, 0.002)))
    const j = (i + Math.round(look / L.ds)) % N
    const tx = L.x[j] - car.pos[0], tz = L.z[j] - car.pos[2]
    const R = car.R
    const lx = tx * R[0] + tz * R[2], lz = tx * R[6] + tz * R[8]
    const alpha = Math.atan2(lx, -lz)
    const dist = Math.hypot(lx, lz)
    let delta = Math.atan(2 * W11.wheelbase * Math.sin(alpha) / Math.max(dist, 3))
    const vRef = car.setup.steerAssist >= 2 ? 26 : car.setup.steerAssist >= 1 ? 34 : 1e9
    const lock = W11.steerLock * Math.max(0.11, 1 / (1 + (v * v) / (vRef * vRef)))
    // amortissement lacet
    const yawDes = -v * 2 * Math.sin(alpha) / Math.max(dist, 3)
    delta += (car.wb[1] - yawDes) * 0.04
    // contre-braquage : aligne les roues avant sur la trajectoire réelle quand l'arrière décroche
    const vr = car.vel[0] * R[0] + car.vel[2] * R[2], vf = -(car.vel[0] * R[6] + car.vel[2] * R[8])
    const beta = Math.atan2(vr, Math.max(vf, 3))
    if (v > 8) delta += beta * 0.9
    // le pilote ne braque pas au-delà du pic de dérive avant (sinon sous-virage pur)
    const fl = car.wheels[0], fr = car.wheels[1]
    const curDelta = (fl.steer + fr.steer) / 2, aF = (fl.alpha + fr.alpha) / 2
    const kin = curDelta + aF
    const aT = W11.tyre.aPeak * 1.1
    if (v > 12 && Math.sign(delta) === Math.sign(kin + Math.sign(delta) * aT)) {
      const dl = kin + Math.sign(delta) * aT
      if (Math.abs(delta) > Math.abs(dl)) delta = dl
    }
    const steer = Math.max(-1, Math.min(1, delta / lock))
    const ia = (i + Math.round((v * 0.2 + 3) / L.ds)) % N
    // écart latéral à la trajectoire → le pilote lève le pied (marge de sécurité)
    const latErr = Math.abs(car.d - L.e[i])
    // météo : le pilote adapte ses vitesses de passage à l'adhérence mesurée (v ∝ √μ) et freine plus tôt (regard plus loin)
    this.gS += (Math.sqrt(Math.min(1.03, car.wetGrip)) * (car.wetGrip < 0.95 ? 0.93 : 1) - this.gS) * 0.01
    let vt = L.v[ia] * this.pace * this.gS
    if (this.gS < 0.97) { const far = (i + Math.round((v * v / (2 * 9.81 * 2.2 * this.gS * this.gS) + 5) / L.ds)) % N; vt = Math.min(vt, Math.sqrt(Math.max(0, (L.v[far] * this.pace * this.gS) ** 2 + 2 * 9.81 * 2.4 * this.gS * this.gS * Math.max(0, ((far - ia + N) % N) * L.ds)))) }
    const err = vt - v
    let throttle = 0, brake = 0
    if (err > 0.3) throttle = Math.min(1, 0.55 + err * 0.5)
    else if (err < -1.2) brake = Math.min(1, -err * 0.16)
    else throttle = 0.25 + err * 0.2
    // modulation pilote : pas de blocage (pas d'ABS en F1) et budget d'adhérence combiné en courbe
    const kF = Math.max(-fl.kappa, -fr.kappa)
    if (brake > 0 && kF > W11.tyre.kPeak * 0.85) this.bScale = Math.max(0.35, this.bScale - 0.01 * (kF / (W11.tyre.kPeak * 0.85)))
    else this.bScale = Math.min(1, this.bScale + 0.015)
    const lat = Math.min(1, Math.abs(aF) / W11.tyre.aPeak)
    brake *= this.bScale * Math.sqrt(Math.max(0.08, 1 - lat * lat * 0.9))
    const aR = (car.wheels[2].alpha + car.wheels[3].alpha) / 2
    const latR = Math.min(1, Math.abs(aR) / W11.tyre.aPeak)
    // hors trajectoire : on ne réaccélère pas tant que l'écart n'est pas résorbé (sans freiner : ça bloquerait la roue intérieure)
    if (latErr > 1.2 && lat > 0.8) throttle = Math.min(throttle, Math.max(0.15, 0.6 - 0.08 * latErr))
    if (latR > 0.6) throttle *= Math.max(0.3, 1 - (latR - 0.6) * 1.5)
    return { throttle: Math.max(0, throttle), brake, steer, drs: true }
  }
}
