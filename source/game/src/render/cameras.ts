/** Caméras : cockpit (œil du pilote, secousses), T-cam (au-dessus de la boîte à air), poursuite proche / lointaine,
 *  caméras TV en bord de piste (zoom), libre (orbite tactile). Toutes lissées, sans allocation par image. */
import * as THREE from 'three'
import type { TrackSurface } from '../track/surface.ts'

export type CamMode = 'cockpit' | 'tcam' | 'close' | 'chase' | 'tv' | 'free'
export const CAM_ORDER: CamMode[] = ['chase', 'close', 'tcam', 'cockpit', 'tv', 'free']
export const CAM_LABEL: Record<CamMode, string> = { cockpit: 'Cockpit', tcam: 'T-cam', close: 'Poursuite proche', chase: 'Poursuite', tv: 'TV', free: 'Libre' }

export class CameraRig {
  cam: THREE.PerspectiveCamera; mode: CamMode = 'chase'
  orbitYaw = 0.6; orbitPitch = 0.25; orbitDist = 7
  shake = 0
  private pos = new THREE.Vector3(); private look = new THREE.Vector3(); private first = true
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3(); private m = new THREE.Matrix4()
  private tvPoints: THREE.Vector3[] = []; private tvIdx = -1
  private yawS = 0
  constructor(aspect: number, far: number, track: TrackSurface) {
    this.cam = new THREE.PerspectiveCamera(60, aspect, 0.08, far)
    // caméras TV : tous les ~260 m, côté extérieur alterné, 3–6 m de haut, au-delà du mur
    for (let s = 40; s < track.length; s += 260) {
      const i = Math.floor(s / track.ds) % track.N, side = (Math.floor(s / 260) % 2) ? 1 : -1
      const off = side > 0 ? track.WR[i] + 4 : -(track.WL[i] + 4)
      const tx = track.tx[i], tz = track.tz[i]
      this.tvPoints.push(new THREE.Vector3(track.cx[i] - tz * off, track.cy[i] + 4.5, track.cz[i] + tx * off))
    }
  }
  setMode(m: CamMode) { this.mode = m; this.first = true; this.tvIdx = -1 }
  /** car : objet de la voiture (pose interpolée), eye/tcam : points en repère modèle, speed m/s, dt réel. */
  update(car: THREE.Object3D, eye: THREE.Vector3, tcam: THREE.Vector3, speed: number, dt: number, gLat: number, gLong: number) {
    const c = this.cam, q = car.quaternion
    const fwd = this.tmp.set(0, 0, -1).applyQuaternion(q)
    const k = this.first ? 1 : 1 - Math.exp(-dt * 9)
    let fov = 60
    const t = performance.now() * 0.001
    switch (this.mode) {
      case 'cockpit': case 'tcam': {
        const p = (this.mode === 'cockpit' ? eye : tcam)
        this.pos.copy(p).applyMatrix4(car.matrixWorld)
        // secousses : vitesse + vibreurs (amplitude fournie par le moteur via this.shake)
        const a = (this.shake * 0.012 + Math.min(1, speed / 90) * 0.0012)
        this.pos.x += Math.sin(t * 61) * a; this.pos.y += Math.sin(t * 47 + 1) * a
        c.position.copy(this.pos)
        c.quaternion.copy(q)
        // tête qui encaisse les G (cockpit uniquement)
        if (this.mode === 'cockpit') { c.rotateZ(-gLat * 0.012); c.rotateX(gLong * 0.006 - 0.035) }
        else c.rotateX(-0.05)
        fov = this.mode === 'cockpit' ? 72 : 66
        break
      }
      case 'close': case 'chase': {
        const dist = this.mode === 'close' ? 4.6 : 7.8, h = this.mode === 'close' ? 1.35 : 2.1
        // cap lissé (la caméra suit le vecteur vitesse/cap sans copier chaque oscillation)
        const yaw = Math.atan2(-fwd.x, -fwd.z)
        let dy = yaw - this.yawS; dy = Math.atan2(Math.sin(dy), Math.cos(dy))
        this.yawS += this.first ? dy : dy * (1 - Math.exp(-dt * 7))
        const bx = Math.sin(this.yawS) * dist, bz = Math.cos(this.yawS) * dist
        this.tmp2.set(car.position.x + bx, car.position.y + h, car.position.z + bz)
        this.pos.lerp(this.tmp2, this.first ? 1 : 1 - Math.exp(-dt * 14))
        if (this.first) this.pos.copy(this.tmp2)
        c.position.copy(this.pos)
        this.look.set(car.position.x - Math.sin(this.yawS) * 6, car.position.y + 0.7, car.position.z - Math.cos(this.yawS) * 6)
        c.lookAt(this.look)
        fov = 58 + Math.min(10, speed * 0.09)
        break
      }
      case 'tv': {
        let best = 0, bd = Infinity
        for (let i = 0; i < this.tvPoints.length; i++) { const d = this.tvPoints[i].distanceToSquared(car.position); if (d < bd) { bd = d; best = i } }
        if (best !== this.tvIdx) { this.tvIdx = best; this.first = true }
        c.position.copy(this.tvPoints[best])
        this.look.lerp(car.position, this.first ? 1 : k)
        c.lookAt(this.look)
        fov = THREE.MathUtils.clamp(2 * Math.atan(9 / Math.max(1, Math.sqrt(bd))) * 57.3, 6, 55)
        break
      }
      case 'free': {
        const d = this.orbitDist
        this.pos.set(Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * d, Math.sin(this.orbitPitch) * d + 0.6, Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * d)
        c.position.copy(car.position).add(this.pos)
        this.look.copy(car.position); this.look.y += 0.5
        c.lookAt(this.look)
        fov = 50
        break
      }
    }
    if (Math.abs(c.fov - fov) > 0.05) { c.fov += (fov - c.fov) * (this.first ? 1 : Math.min(1, dt * 4)); c.updateProjectionMatrix() }
    this.first = false
    void this.m
  }
}
