/** Animation du modèle W11 pilotée par la physique : roues (rotation, braquage, débattement), volant,
 *  bras du pilote (clip « steer » échantillonné), tête (forces G, regard vers la corde), DAS (volant tiré), volet DRS,
 *  disques incandescents (température de frein), matériaux (vernis carrosserie, carbone anisotrope). */
import * as THREE from 'three'
import type { Vehicle } from '../physics/vehicle.ts'
import { W11 } from '../physics/params.ts'

const WN = ['FL', 'FR', 'RL', 'RR'] as const
export class CarRig {
  root: THREE.Object3D
  hubs: THREE.Object3D[] = []; spins: THREE.Object3D[] = []; base: THREE.Vector3[] = []
  sw: THREE.Object3D | null = null; swQ0 = new THREE.Quaternion(); swP0 = new THREE.Vector3()
  head: THREE.Object3D | null = null
  drs: THREE.Object3D | null = null; drsDeg = 25 // volet DRS (tools/split-drs.mjs) ; 25° = E
  mixer: THREE.AnimationMixer | null = null; action: THREE.AnimationAction | null = null; clipDur = 0.3333
  glow: THREE.MeshStandardMaterial[][] = [[], [], [], []]
  blur: THREE.Mesh[][] = [[], [], [], []]; sharp: THREE.Mesh[][] = [[], [], [], []]
  eye = new THREE.Vector3(0, 0.93, -0.12) // œil pilote (repère modèle), ajusté au chargement
  tcam = new THREE.Vector3(0, 1.2, 0.15)
  private q = new THREE.Quaternion(); private e = new THREE.Euler()
  private headLook = 0
  constructor(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, anisotropy: number) {
    this.root = gltf.scene
    const byName = (n: string) => this.root.getObjectByName(n) ?? null
    WN.forEach((n, i) => {
      const hub = byName('W_' + n)!, spin = byName('W_' + n + '_spin')!
      this.hubs.push(hub); this.spins.push(spin); this.base.push(hub.position.clone())
      spin.traverse(o => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = m.material as THREE.MeshStandardMaterial
        if (/disc/i.test(mat.name)) { const c = mat.clone(); c.emissive = new THREE.Color(1, 0.32, 0.05); c.emissiveIntensity = 0; m.material = c; this.glow[i].push(c) }
        if (/BLUR/.test(mat.name) || /BLUR/.test(m.name)) { this.blur[i].push(m); m.visible = false }
        else if (/wheel_hub|RIM/i.test(m.name)) this.sharp[i].push(m)
      })
    })
    this.sw = byName('STEERING_WHEEL'); if (this.sw) { this.swQ0.copy(this.sw.quaternion); this.swP0.copy(this.sw.position) }
    this.head = byName('head')
    this.drs = byName('DRS_pivot')
    const clip = gltf.animations.find(a => a.name === 'steer')
    if (clip) {
      this.mixer = new THREE.AnimationMixer(this.root)
      this.action = this.mixer.clipAction(clip); this.action.play(); this.action.paused = true; this.clipDur = clip.duration
      this.setSteer(0)
    }
    const tv = byName('tvcam'); if (tv) { const b = new THREE.Box3().setFromObject(tv); b.getCenter(this.tcam); this.tcam.y = b.max.y + 0.06 }
    // matériaux : vernis carrosserie, carbone anisotrope, ombres
    const seen = new Set<THREE.Material>()
    this.root.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = true; m.receiveShadow = true
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mt of mats) {
        if (seen.has(mt)) continue; seen.add(mt)
        const s = mt as THREE.MeshPhysicalMaterial
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'] as const) { const t = s[k]; if (t) t.anisotropy = anisotropy }
        if (/PAINT|merc1|Car_wing/i.test(s.name) && s.isMeshPhysicalMaterial) { s.clearcoat = Math.max(s.clearcoat, 0.9); s.clearcoatRoughness = 0.04 }
        if (/carbon/i.test(s.name) && s.isMeshPhysicalMaterial) { /* pas d anisotropie : sans tangentes, elle créait des lucioles blanches (scintillement) sur tout l arrière */ s.anisotropy = 0; s.clearcoat = Math.max(s.clearcoat, 0.5); s.clearcoatRoughness = 0.08 }
        if (/GLASS|Visor|Clear/i.test(s.name)) { m.castShadow = false }
      }
    })
  }
  private setSteer(theta: number) { // theta en degrés, + = droite, borné ±90 (plage du clip)
    if (!this.mixer || !this.action) return
    const t = (Math.max(-90, Math.min(90, theta)) / 90 + 1) / 2 * this.clipDur
    this.action.time = Math.min(this.clipDur - 1e-4, Math.max(0, t)); this.mixer.update(0)
  }
  /** wheels : états interpolés (compression, angle, braquage). */
  update(car: Vehicle, wheels: { c: number; angle: number; steer: number }[], dt: number) {
    const fw = car.wheels
    for (let i = 0; i < 4; i++) {
      const w = wheels[i], hub = this.hubs[i], b = this.base[i]
      hub.position.set(b.x, b.y + w.c, b.z)
      hub.rotation.set(0, -w.steer, 0)
      this.spins[i].rotation.x = -w.angle
      // flou de jante à haute vitesse (modèle d'origine : jantes « BLUR »)
      const fast = Math.abs(fw[i].omega) * fw[i].r > 33
      for (const m of this.blur[i]) m.visible = fast
      for (const m of this.sharp[i]) m.visible = !fast || !this.blur[i].length
      const T = fw[i].brakeT, g = Math.max(0, Math.min(1, (T - 480) / 520))
      for (const mt of this.glow[i]) mt.emissiveIntensity = g * g * 6
    }
    // volant : angle des roues avant (hors pincement) rapporté à la butée → ±90°
    const steerFrac = ((wheels[0].steer - W11.toeF * (1 - car.dasPos)) + (wheels[1].steer + W11.toeF * (1 - car.dasPos))) / 2 / W11.steerLock
    const theta = Math.max(-1, Math.min(1, steerFrac)) * 90
    if (this.sw) {
      this.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -theta * Math.PI / 180)
      this.sw.quaternion.copy(this.swQ0).multiply(this.q)
      this.sw.position.copy(this.swP0); this.sw.position.z += car.dasPos * 0.035 // DAS : volant tiré vers le pilote
    }
    this.setSteer(theta)
    // DRS : le volet pivote autour de son bord de fuite (car.drsPos lissé ~0,1 s dans la physique)
    if (this.drs) this.drs.rotation.x = car.drsPos * this.drsDeg * Math.PI / 180
    // tête : regard vers la corde + inclinaison sous G latéral / longitudinal (après le clip)
    if (this.head) {
      this.headLook += (-theta / 90 * 0.28 - this.headLook) * Math.min(1, dt * 6)
      const roll = Math.max(-0.22, Math.min(0.22, car.gLat * 0.035)), pitch = Math.max(-0.15, Math.min(0.15, car.gLong * 0.02))
      this.e.set(pitch, this.headLook, roll, 'YXZ'); this.q.setFromEuler(this.e)
      this.head.quaternion.multiply(this.q)
    }
  }
}
