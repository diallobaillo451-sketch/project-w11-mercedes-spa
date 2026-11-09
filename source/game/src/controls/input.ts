/** Commandes paysage : pédales tactiles analogiques (accélérateur à droite, frein à gauche — la profondeur du
 *  doigt sur la pédale = dosage), gyroscope iOS (permission après un geste, calibration du neutre, zone morte,
 *  lissage, courbe), direction tactile (glisser horizontal), clavier/manette pour l'ordinateur. */
import { wheelAngleDeg, currentScreenAngle } from './gyro.ts'
export type SteerMode = 'gyro' | 'touch' | 'buttons'
export interface InputState { throttle: number; brake: number; steer: number; drs: boolean; das: boolean; shiftUp: boolean; shiftDown: boolean }
export interface InputSettings { steerMode: SteerMode; gyroRange: number; deadzone: number; smoothing: number; linearity: number; invert: boolean }
export const defaultInput = (): InputSettings => ({ steerMode: 'touch', gyroRange: 32, deadzone: 0.03, smoothing: 0.35, linearity: 1.35, invert: false })

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export class Input {
  st: InputState = { throttle: 0, brake: 0, steer: 0, drs: false, das: false, shiftUp: false, shiftDown: false }
  set: InputSettings
  gyroOK = false; gyroDenied = false
  private gyroRaw = 0; private gyroZero = 0; private keys = new Set<string>()
  private touchSteer = 0; private steerTouchId: number | null = null; private steerX0 = 0
  private pedal = { throttle: 0, brake: 0 }
  private steerOut = 0
  private onTap: ((k: 'up' | 'down') => void) | null = null
  constructor(set: InputSettings) {
    this.set = set
    addEventListener('keydown', e => { this.keys.add(e.code); if (e.code === 'KeyE') this.st.shiftUp = true; if (e.code === 'KeyQ') this.st.shiftDown = true })
    addEventListener('keyup', e => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())
  }
  /** Pédale analogique : 0 en bas de la zone, 1 en haut ; plusieurs doigts gérés (pointer events). */
  bindPedal(el: HTMLElement, which: 'throttle' | 'brake') {
    const ids = new Set<number>()
    const val = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return clamp(1.12 - (e.clientY - r.top) / r.height * 1.05, 0.15, 1) }
    const upd = (e: PointerEvent) => { this.pedal[which] = val(e); el.style.setProperty('--v', String(this.pedal[which])) }
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); ids.add(e.pointerId); upd(e); el.classList.add('on') })
    el.addEventListener('pointermove', e => { if (ids.has(e.pointerId)) upd(e) })
    const end = (e: PointerEvent) => { ids.delete(e.pointerId); if (!ids.size) { this.pedal[which] = 0; el.style.setProperty('--v', '0'); el.classList.remove('on') } }
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end)
  }
  /** Zone de direction tactile : glisser horizontalement depuis le point de contact (±18 % de la largeur = butée). */
  bindSteerZone(el: HTMLElement, knob: HTMLElement) {
    el.addEventListener('pointerdown', e => { if (this.steerTouchId !== null) return; e.preventDefault(); el.setPointerCapture(e.pointerId); this.steerTouchId = e.pointerId; this.steerX0 = e.clientX; knob.style.left = e.clientX + 'px'; knob.classList.add('on') })
    el.addEventListener('pointermove', e => { if (e.pointerId !== this.steerTouchId) return; this.touchSteer = clamp((e.clientX - this.steerX0) / (innerWidth * 0.18), -1, 1); knob.style.setProperty('--s', String(this.touchSteer)) })
    const end = (e: PointerEvent) => { if (e.pointerId !== this.steerTouchId) return; this.steerTouchId = null; this.touchSteer = 0; knob.style.setProperty('--s', '0'); knob.classList.remove('on') }
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end)
  }
  bindHold(el: HTMLElement, set: (v: boolean) => void) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); set(true); el.classList.add('on') })
    const off = () => { set(false); el.classList.remove('on') }
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off)
  }
  bindTap(el: HTMLElement, f: () => void) { el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); f() }) }
  /** iOS 13+ : DeviceOrientationEvent.requestPermission() DOIT être appelé dans un geste utilisateur. */
  async enableGyro(): Promise<boolean> {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
    try {
      if (DOE && typeof DOE.requestPermission === 'function') { const r = await DOE.requestPermission(); if (r !== 'granted') { this.gyroDenied = true; return false } }
    } catch { this.gyroDenied = true; return false }
    addEventListener('deviceorientation', e => this.onOrient(e))
    this.gyroOK = true
    return true
  }
  /** Volant = rotation de l'appareil dans le plan de l'écran, via la verticale (voir gyro.ts) ; paysage gauche/droite via screen.orientation. */
  private onOrient(e: DeviceOrientationEvent) {
    if (e.beta == null || e.gamma == null) return
    this.gyroRaw = wheelAngleDeg(e.beta, e.gamma, currentScreenAngle())
  }
  calibrate() { this.gyroZero = this.gyroRaw }
  /** À appeler à chaque image. */
  poll(dt: number, autoShift: boolean): InputState {
    const k = this.keys, s = this.set
    const kbT = k.has('ArrowUp') || k.has('KeyW') ? 1 : 0, kbB = k.has('ArrowDown') || k.has('KeyS') || k.has('Space') ? 1 : 0
    const kbS = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0)
    let target = 0
    if (kbS !== 0) target = kbS
    else if (s.steerMode === 'gyro' && this.gyroOK) {
      let a = (this.gyroRaw - this.gyroZero); a = ((a + 180) % 360 + 360) % 360 - 180
      let x = clamp(a / s.gyroRange, -1, 1)
      const dz = s.deadzone; x = Math.abs(x) < dz ? 0 : Math.sign(x) * (Math.abs(x) - dz) / (1 - dz)
      target = Math.sign(x) * Math.pow(Math.abs(x), s.linearity)
    } else target = Math.sign(this.touchSteer) * Math.pow(Math.abs(this.touchSteer), s.linearity)
    if (s.invert) target = -target
    // lissage exponentiel (constante de temps ∝ réglage) ; clavier : rampe pour éviter les à-coups
    const tau = kbS !== 0 ? 0.09 : 0.012 + s.smoothing * 0.09
    this.steerOut += (target - this.steerOut) * (1 - Math.exp(-dt / tau))
    this.st.steer = this.steerOut
    this.st.throttle = Math.max(this.pedal.throttle, kbT)
    this.st.brake = Math.max(this.pedal.brake, kbB)
    if (k.has('KeyF')) this.st.drs = true
    void autoShift; void this.onTap
    return this.st
  }
  consumeShifts() { this.st.shiftUp = false; this.st.shiftDown = false }
}
