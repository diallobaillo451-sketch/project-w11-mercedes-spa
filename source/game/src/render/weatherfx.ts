/** Effets visuels de piste et de météo (aucune texture chargée, coût mémoire < 1 Mo) :
 *  - chaussée mouillée : albédo assombri, rugosité très basse (reflets du ciel), flaques en coordonnées monde ;
 *  - ciel couvert : dôme, brouillard, soleil, ambiance ; pluie qui tombe (traits autour de la caméra) ;
 *  - traces de pneus persistantes (anneau de 6000 segments instanciés) : freinage, blocage, patinage, dérive,
 *    terre/herbe ramenées ; - débris physiques (pièces de carbone, roue) ; - gouttes sur la caméra cockpit (calque 2D). */
import * as THREE from 'three'
import type { Game } from '../core/game.ts'

export const wetU = { uWet: { value: 0 } }
const ROAD = /^(road|asph|groove|Parking|kerb|curb|rumble|pit|line|white|paint|concrete-fl|tarmac)/i
/** chaussée : branche le mouillé sur un matériau de piste (une fois) */
export function applyWet(mt: THREE.MeshStandardMaterial) {
  if (!ROAD.test(mt.name || '') || mt.userData.wet) return
  mt.userData.wet = true
  const prev = mt.onBeforeCompile, prevKey = mt.customProgramCacheKey
  mt.onBeforeCompile = (sh, r) => {
    prev.call(mt, sh, r)
    sh.uniforms.uWet = wetU.uWet
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying float vRUp;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 ww = modelMatrix * vec4(transformed, 1.0); vRW = ww.xyz; vRUp = normalize(mat3(modelMatrix) * objectNormal).y; }')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vRW; varying float vRUp; uniform float uWet;
      float rH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rH(i), rH(i + vec2(1, 0)), f.x), mix(rH(i + vec2(0, 1)), rH(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      float wetM = uWet * smoothstep(0.7, 0.95, vRUp);
      float pud = smoothstep(0.55, 0.8, rN(vRW.xz * 0.35) * 0.65 + rN(vRW.xz * 1.7) * 0.35) * smoothstep(0.3, 0.9, uWet);
      diffuseColor.rgb *= mix(1.0, 0.5, wetM) * mix(1.0, 0.8, pud * wetM);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, mix(0.42, 0.12, pud), wetM);`)
  }
  mt.customProgramCacheKey = () => (prevKey ? prevKey.call(mt) : '') + '|wet'
  mt.needsUpdate = true
}

/** traces de pneus : segments instanciés (quad à plat), alpha par instance, ancrés au sol (+1 cm) */
export class SkidMarks {
  mesh: THREE.InstancedMesh; private n = 6000; private next = 0; private alpha: Float32Array; private col: Float32Array
  private last: (number[] | null)[] = [null, null, null, null]
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3(); private up = new THREE.Vector3(0, 1, 0)
  constructor() {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    this.alpha = new Float32Array(this.n); this.col = new Float32Array(this.n * 3)
    g.setAttribute('aA', new THREE.InstancedBufferAttribute(this.alpha, 1)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(this.col, 3))
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: `attribute float aA; attribute vec3 aC; varying float vA; varying vec3 vC; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){ vA = aA; vC = aC; vUv = uv; vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `varying float vA; varying vec3 vC; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){ float e = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y); float str = 0.8 + 0.2 * fract(sin(floor(vUv.y * 7.0) * 91.7) * 437.5); // bords doux en travers, rainures de gomme dans la largeur
        gl_FragColor = vec4(vC, vA * e * str);
        #include <fog_fragment>
        }` })
    this.mesh = new THREE.InstancedMesh(g, mat, this.n); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 1; this.mesh.name = 'skidmarks'
  }
  /** i : roue ; intensité 0..1 ; kind 0 gomme (noir), 1 terre (brun), 2 herbe arrachée */
  add(i: number, p: number[], width: number, k: number, kind: number) {
    const L = this.last[i]
    if (k <= 0.02) { this.last[i] = null; return }
    if (!L) { this.last[i] = [p[0], p[1], p[2]]; return }
    const dx = p[0] - L[0], dz = p[2] - L[2], len = Math.hypot(dx, dz)
    if (len < 0.35) return
    if (len > 3) { this.last[i] = [p[0], p[1], p[2]]; return }
    const j = this.next; this.next = (this.next + 1) % this.n; this.mesh.count = Math.max(this.mesh.count, this.next === 0 ? this.n : this.next)
    this.v.set((p[0] + L[0]) / 2, (p[1] + L[1]) / 2 + 0.012, (p[2] + L[2]) / 2)
    this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz) + Math.PI / 2)
    this.s.set(len + 0.04, 1, width)
    this.mesh.setMatrixAt(j, this.m.compose(this.v, this.q, this.s))
    this.alpha[j] = Math.min(0.75, k * 0.75)
    const c = kind === 0 ? [0.02, 0.02, 0.02] : kind === 1 ? [0.24, 0.19, 0.13] : [0.16, 0.13, 0.08]
    this.col.set(c, j * 3)
    this.mesh.instanceMatrix.needsUpdate = true
    ;(this.mesh.geometry.attributes.aA as THREE.BufferAttribute).needsUpdate = true; (this.mesh.geometry.attributes.aC as THREE.BufferAttribute).needsUpdate = true
    this.last[i] = [p[0], p[1], p[2]]
  }
  clear() { this.mesh.count = 0; this.next = 0; this.last = [null, null, null, null] }
}

/** pluie : traits autour de la caméra (boîte de 40 m qui suit), vent compris */
export class RainStreaks {
  mesh: THREE.LineSegments; private n = 2400; private p: Float32Array; private base: Float32Array
  constructor() {
    this.p = new Float32Array(this.n * 6); this.base = new Float32Array(this.n * 3)
    for (let i = 0; i < this.n; i++) { this.base[i * 3] = Math.random() * 40 - 20; this.base[i * 3 + 1] = Math.random() * 24; this.base[i * 3 + 2] = Math.random() * 40 - 20 }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage))
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c4cc, transparent: true, opacity: 0.32, depthWrite: false, fog: false }))
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 6
  }
  update(cam: THREE.Vector3, t: number, rate: number, wind: number[], carV: number[]) {
    this.mesh.visible = rate > 0.2; if (!this.mesh.visible) return
    const n = Math.min(this.n, Math.round(this.n * Math.min(1, rate / 9))), fall = 9, P = this.p
    // traits étirés par la vitesse relative (pluie + vent − voiture), longueur = 1/30 s
    const vx = wind[0] - carV[0], vy = -fall, vz = wind[2] - carV[2], k = 1 / 30
    for (let i = 0; i < this.n; i++) {
      const o = i * 6
      if (i >= n) { P[o] = P[o + 3] = 0; P[o + 1] = P[o + 4] = -9999; P[o + 2] = P[o + 5] = 0; continue }
      const y = ((this.base[i * 3 + 1] - t * fall) % 24 + 24) % 24
      const x = cam.x + (((this.base[i * 3] + wind[0] * t - cam.x) % 40) + 60) % 40 - 20, z = cam.z + (((this.base[i * 3 + 2] + wind[2] * t - cam.z) % 40) + 60) % 40 - 20
      P[o] = x; P[o + 1] = cam.y - 6 + y; P[o + 2] = z; P[o + 3] = x - vx * k; P[o + 4] = cam.y - 6 + y - vy * k; P[o + 5] = z - vz * k
    }
    ;(this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }
}

/** gouttes sur la caméra cockpit (calque 2D au-dessus du rendu, 15 Hz) : apparaissent avec la pluie, chassées par la vitesse */
export class LensDrops {
  cv = document.createElement('canvas'); private g: CanvasRenderingContext2D; private d: { x: number; y: number; r: number; vy: number; life: number }[] = []; private acc = 0
  constructor() { this.cv.className = 'lensdrops'; this.g = this.cv.getContext('2d')!; document.body.appendChild(this.cv) }
  update(dt: number, on: boolean, rate: number, speed: number) {
    this.acc += dt; if (this.acc < 1 / 15) return; const h = this.acc; this.acc = 0
    if (!on || (rate < 0.2 && !this.d.length)) { if (this.cv.style.display !== 'none') { this.cv.style.display = 'none'; this.d = [] } return }
    this.cv.style.display = ''
    const W = Math.round(innerWidth / 1.5), H = Math.round(innerHeight / 1.5); if (this.cv.width !== W) { this.cv.width = W; this.cv.height = H }
    const g = this.g; g.clearRect(0, 0, W, H)
    const spawn = rate * h * 2.2 * (1 + Math.min(2, speed / 40))
    for (let i = 0; i < spawn; i++) if (this.d.length < 90 && Math.random() < spawn - i) this.d.push({ x: Math.random() * W, y: Math.random() * H * 0.85, r: 1.5 + Math.random() * 4.5, vy: 0, life: 1 })
    for (const p of this.d) {
      // l'air chasse les gouttes vers le haut et l'extérieur au-delà de ~120 km/h
      const a = Math.max(0, speed - 30) * 0.9
      p.vy -= a * h * (p.r / 4); p.y += p.vy * h; p.x += (p.x - W / 2) / W * a * h * 0.6; p.life -= h * (0.12 + speed / 400)
      const gr = g.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.1, p.x, p.y, p.r)
      gr.addColorStop(0, `rgba(255,255,255,${0.55 * p.life})`); gr.addColorStop(0.6, `rgba(190,205,215,${0.18 * p.life})`); gr.addColorStop(1, `rgba(20,25,30,${0.35 * p.life})`)
      g.fillStyle = gr; g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * (1 + Math.min(2, -p.vy / 200)), 0, 0, Math.PI * 2); g.fill()
    }
    this.d = this.d.filter(p => p.life > 0 && p.y > -10 && p.x > -10 && p.x < W + 10)
  }
}

/** débris visibles : éclats de carbone (pièces d'aileron, dérives, déflecteurs) et roue arrachée */
export class DebrisView {
  group = new THREE.Group(); private meshes = new Map<object, THREE.Object3D>()
  private carbon = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.2 })
  private silver = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.3, metalness: 0.6 })
  private tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 })
  update(game: Game) {
    const live = new Set<object>()
    for (const d of game.debris) {
      live.add(d)
      let m = this.meshes.get(d)
      if (!m) {
        if (d.part.startsWith('wheel')) { m = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, d.part === 'wheel2' || d.part === 'wheel3' ? 0.405 : 0.305, 20).rotateZ(Math.PI / 2), this.tyre) }
        else { const big = d.part === 'frontWing' || d.part === 'rearWing'; m = new THREE.Group()
          for (let k = 0; k < (big ? 3 : 2); k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.5 + Math.random() * 0.4 : 0.25 + Math.random() * 0.2, 0.015, 0.12 + Math.random() * 0.2), k === 0 && big ? this.silver : this.carbon)
            b.position.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.3); b.rotation.y = Math.random() * 3; b.castShadow = true; m.add(b) } }
        m.castShadow = true; this.group.add(m); this.meshes.set(d, m)
      }
      m.position.set(d.pos[0], d.pos[1] + (d.part.startsWith('wheel') ? 0.3 : 0), d.pos[2]); m.rotation.set(d.part.startsWith('wheel') ? 0 : d.rot[0] * 0.2, d.rot[1], d.rot[2] * (d.rest ? 0 : 1))
    }
    for (const [k, m] of this.meshes) if (!live.has(k)) { this.group.remove(m); this.meshes.delete(k) }
  }
}
