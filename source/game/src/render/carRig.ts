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
  private headLook = 0; private hRoll = 0; private hPitch = 0
  /** tête au repos (repère de la voiture) : le clip « steer » faisait monter/descendre la tête avec les épaules ;
   *  avec le HANS la tête reste quasi fixe → position imposée, seules de petites rotations amorties sont ajoutées */
  private headRestP = new THREE.Vector3(); private headRestQ = new THREE.Quaternion(); private headOk = false
  private hv = new THREE.Vector3(); private hq2 = new THREE.Quaternion(); private hq3 = new THREE.Quaternion()
  /** dégâts visibles : aileron AV / AR séparés du maillage Car_wing au chargement */
  dmgFront: THREE.Object3D | null = null; dmgRear: THREE.Object3D | null = null
  private dmgFrontP = new THREE.Vector3(); private dmgRearP = new THREE.Vector3(); private wingLost = [false, false]
  onPartLost: ((which: 'front' | 'rear', worldPos: THREE.Vector3) => void) | null = null
  /** gants : main tournée de 18° vers l'extérieur autour de l'axe du volant, doigts enroulés derrière la poignée
   *  (direction mesurée, repère voiture Blender) au lieu de traverser la face du volant */
  grip: { h: THREE.Object3D; f: THREE.Object3D; sg: number }[] = []
  gripOn = typeof location === 'undefined' || new URLSearchParams(location.search).get('grip') !== '0'
  swRel0 = new THREE.Quaternion(); gripHA = 18 * Math.PI / 180; gripFD = new THREE.Vector3(-0.6, 0.75, -0.1)
  private gq = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]
  private gv = [new THREE.Vector3(), new THREE.Vector3()]
  private fixGrip() {
    if (!this.sw || !this.grip.length) return
    const [rq, rc, a, b, c] = this.gq, [v1, v2] = this.gv
    this.root.updateMatrixWorld(true)
    this.root.getWorldQuaternion(rq)
    this.sw.getWorldQuaternion(rc).multiply(a.copy(rq).multiply(this.swRel0).invert()) // rotation actuelle du volant (monde)
    for (const { h, f, sg } of this.grip) {
      v1.set(0, 1, 0).applyQuaternion(rq).applyQuaternion(rc)
      a.setFromAxisAngle(v1, -this.gripHA * sg)
      h.getWorldQuaternion(b).premultiply(a); h.parent!.getWorldQuaternion(c).invert(); h.quaternion.copy(c.multiply(b)); h.updateMatrixWorld(true)
      f.getWorldQuaternion(b); v1.set(0, 1, 0).applyQuaternion(b)
      v2.set(this.gripFD.x * sg, this.gripFD.z, -this.gripFD.y).normalize().applyQuaternion(rq).applyQuaternion(rc)
      a.setFromUnitVectors(v1, v2); b.premultiply(a); f.parent!.getWorldQuaternion(c).invert(); f.quaternion.copy(c.multiply(b)); f.updateMatrixWorld(true)
    }
  }
  headMeshes: THREE.Object3D[] = []
  setCockpit(on: boolean) { for (const o of this.headMeshes) o.visible = !on }
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
    // prise du volant corrigée (point 9) : réglage mesuré dans Blender (blender/scripts/d7_grip_check.py, captures out/blender/mains_*)
    for (const k of ['R', 'L']) { const h = byName('hand.' + k), f = byName('fingers.' + k); if (h && f) this.grip.push({ h, f, sg: k === 'R' ? 1 : -1 }) }
    if (this.sw) { this.root.updateMatrixWorld(true); const rq = this.root.getWorldQuaternion(new THREE.Quaternion()); this.swRel0.copy(rq.invert().multiply(this.sw.getWorldQuaternion(new THREE.Quaternion()))) }
    if (this.head) { this.root.updateMatrixWorld(true); this.head.getWorldPosition(this.headRestP); this.root.worldToLocal(this.headRestP)
      this.head.getWorldQuaternion(this.headRestQ); this.headRestQ.premultiply(this.root.getWorldQuaternion(new THREE.Quaternion()).invert()); this.headOk = true }
    this.splitWings(byName('Car_wing') as THREE.Mesh | null, byName('W_FL'), byName('W_RL'))
    // œil du pilote : derrière la visière (centre de la fente), mesuré sur le casque → caméra cockpit réaliste
    const vis = byName('Helmet_Visor_Helmet_Visor_0')
    if (vis) { this.root.updateMatrixWorld(true); const v = new THREE.Vector3(); vis.getWorldPosition(v); this.root.worldToLocal(v); this.eye.set(0, v.y - 0.005, v.z + 0.02) }
    // en cockpit on masque seulement la tête (casque, visière, yeux) : bras, gants et volant restent visibles
    this.root.traverse(o => { if ((o as THREE.Mesh).isMesh && /Helmet|VISOR|Visor|Head|Eyes|HANS/i.test(o.name)) this.headMeshes.push(o) })
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
  /** sépare l'aileron avant et l'aileron arrière du maillage commun (triangles devant l'essieu AV / derrière l'essieu AR) */
  private splitWings(wing: THREE.Mesh | null, fl: THREE.Object3D | null, rl: THREE.Object3D | null) {
    if (!wing || !fl || !rl || !wing.geometry.index) return
    this.root.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(wing.matrixWorld).invert()
    const F = fl.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), R = rl.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv)
    const ax = F.clone().sub(R), L = ax.length(); ax.normalize()
    const g = wing.geometry, pos = g.getAttribute('position'), idx = g.index!.array, fr: number[] = [], rr: number[] = [], rest: number[] = []
    const c = new THREE.Vector3(), v = new THREE.Vector3()
    for (let t = 0; t < idx.length; t += 3) {
      c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, idx[t + k]))
      c.multiplyScalar(1 / 3); const d = c.sub(R).dot(ax) / L // 0 = essieu AR, 1 = essieu AV
      ;(d > 1.08 ? fr : d < -0.12 ? rr : rest).push(idx[t], idx[t + 1], idx[t + 2])
    }
    if (fr.length < 30 || rr.length < 30) return
    const mk = (ix: number[]) => { const ng = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(g.attributes)) ng.setAttribute(k, a); ng.setIndex(ix); ng.computeBoundingSphere(); return ng }
    wing.geometry = mk(rest)
    const part = (ix: number[], name: string) => { const m = new THREE.Mesh(mk(ix), wing.material); m.name = name; m.castShadow = m.receiveShadow = true
      const piv = new THREE.Group(); piv.name = name + '_pivot'; wing.add(piv); piv.add(m); return piv }
    this.dmgFront = part(fr, 'dmg_front_wing'); this.dmgRear = part(rr, 'dmg_rear_wing')
  }
  private setSteer(theta: number) { // theta en degrés, + = droite, borné ±90 (plage du clip)
    if (!this.mixer || !this.action) return
    const t = (Math.max(-90, Math.min(90, theta)) / 90 + 1) / 2 * this.clipDur
    this.action.time = Math.min(this.clipDur - 1e-4, Math.max(0, t)); this.mixer.update(0)
  }
  /** dégâts visibles : aileron AV qui s'affaisse puis se détache, aileron AR arraché, roue au carrossage faussé.
   *  Rien ne se répare tant que la physique ne remet pas les dégâts à zéro (arrêt aux stands / nouvelle session). */
  applyDamage(D: { frontWing: number; rearWing: number; suspension: number[] }) {
    const f = this.dmgFront, r = this.dmgRear
    if (f) { const lost = D.frontWing > 0.7; f.visible = !lost; f.rotation.set(Math.min(0.5, D.frontWing) * 0.35, D.frontWing * 0.12, D.frontWing * 0.08); f.position.y = -D.frontWing * 0.04
      if (lost && !this.wingLost[0]) { this.wingLost[0] = true; this.onPartLost?.('front', f.getWorldPosition(this.dmgFrontP)) } if (!lost) this.wingLost[0] = false }
    if (r) { const lost = D.rearWing > 0.65; r.visible = !lost; r.rotation.set(-D.rearWing * 0.3, 0, D.rearWing * 0.15)
      if (lost && !this.wingLost[1]) { this.wingLost[1] = true; this.onPartLost?.('rear', r.getWorldPosition(this.dmgRearP)) } if (!lost) this.wingLost[1] = false }
    for (let i = 0; i < 4; i++) { const s = D.suspension[i] ?? 0; if (s > 0.05) this.hubs[i].rotation.z = (i % 2 ? -1 : 1) * s * 0.18 }
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
    if (this.gripOn) this.fixGrip()
    // DRS : le volet pivote autour de son bord de fuite (car.drsPos lissé ~0,1 s dans la physique)
    if (this.drs) this.drs.rotation.x = car.drsPos * this.drsDeg * Math.PI / 180
    // tête : regard vers la corde + inclinaison sous G latéral / longitudinal (après le clip)
    // tête (HANS) : position FIXE dans la coque ; regard ≤ 9° vers la corde, inclinaison ≤ 4° vers l'intérieur du virage
    // sous G latéral, ≤ 4° vers l'avant au freinage ; filtrage amorti (~0,25 s), aucun mouvement vertical
    if (this.head && this.headOk) {
      const k = Math.min(1, dt * 4)
      this.headLook += (-theta / 90 * 0.16 - this.headLook) * k
      this.hRoll += (Math.max(-0.07, Math.min(0.07, -car.gLat * 0.014)) - this.hRoll) * k
      this.hPitch += (Math.max(-0.07, Math.min(0.02, car.gLong * 0.014)) - this.hPitch) * k
      this.e.set(this.hPitch, this.headLook, this.hRoll, 'YXZ'); this.q.setFromEuler(this.e)
      const hp = this.head.parent!; hp.updateWorldMatrix(true, false)
      this.hv.copy(this.headRestP); this.root.localToWorld(this.hv); hp.worldToLocal(this.hv); this.head.position.copy(this.hv)
      this.root.getWorldQuaternion(this.hq2).multiply(this.headRestQ).multiply(this.q) // rotation voulue (monde)
      hp.getWorldQuaternion(this.hq3).invert(); this.head.quaternion.copy(this.hq3.multiply(this.hq2))
    }
    this.applyDamage(car.damage)
  }
}
