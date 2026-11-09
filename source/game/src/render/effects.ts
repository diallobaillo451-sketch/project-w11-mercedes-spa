/** Particules : étincelles (plancher/patins titane au contact du sol, chocs) et fumée de pneus (blocage, patinage).
 *  Points GPU, pool fixe, aucun objet alloué par image. */
import * as THREE from 'three'

const VS = /* glsl */`
attribute float aLife; attribute float aSize;
varying float vLife;
uniform float uScale;
void main(){ vLife = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aLife > 0.0 ? aSize * uScale / max(0.1, -mv.z) : 0.0; gl_Position = projectionMatrix * mv; }`
const FS_SPARK = /* glsl */`
varying float vLife;
void main(){ vec2 p = gl_PointCoord*2.0-1.0; float r = dot(p,p); if (r>1.0) discard;
  float a = (1.0-r) * clamp(vLife*3.0,0.0,1.0);
  gl_FragColor = vec4(vec3(4.0,1.6,0.45)*a, a); }`
const FS_SMOKE = /* glsl */`
varying float vLife;
void main(){ vec2 p = gl_PointCoord*2.0-1.0; float r = dot(p,p); if (r>1.0) discard;
  float a = (1.0-r)*(1.0-r) * clamp(vLife,0.0,1.0) * 0.35;
  gl_FragColor = vec4(vec3(0.82,0.82,0.84), a); }`

class Pool {
  n: number; pos: Float32Array; vel: Float32Array; life: Float32Array; size: Float32Array; grow: number
  geo = new THREE.BufferGeometry(); points: THREE.Points; next = 0; drag: number; grav: number; decay: number
  constructor(n: number, fs: string, additive: boolean, grav: number, drag: number, decay: number, grow: number) {
    this.n = n; this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.size = new Float32Array(n)
    this.grav = grav; this.drag = drag; this.decay = decay; this.grow = grow
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 300 } } })
    this.points = new THREE.Points(this.geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 5
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life = 1) {
    const i = this.next; this.next = (this.next + 1) % this.n
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz
    this.life[i] = life; this.size[i] = size
  }
  update(dt: number) {
    const k = Math.exp(-this.drag * dt)
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt * this.decay
      this.vel[i * 3 + 1] -= this.grav * dt
      for (let a = 0; a < 3; a++) { this.vel[i * 3 + a] *= k; this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt }
      this.size[i] += this.grow * dt
    }
    ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aLife as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
  }
}

export class Effects {
  sparks: Pool; smoke: Pool; group = new THREE.Group()
  private rnd = Math.random
  constructor(budget: number) {
    this.sparks = new Pool(Math.max(64, budget), FS_SPARK, true, 9.8, 1.2, 2.4, 0)
    this.smoke = new Pool(Math.max(48, budget >> 1), FS_SMOKE, false, -0.4, 1.6, 0.45, 2.2)
    this.group.add(this.sparks.points, this.smoke.points)
  }
  setScale(h: number) { for (const p of [this.sparks, this.smoke]) (p.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.9 }
  /** Étincelles au point de contact (monde), avec la vitesse du véhicule. */
  spark(p: number[], v: number[], amount: number) {
    const n = Math.min(12, Math.floor(amount * 6 + this.rnd()))
    for (let k = 0; k < n; k++) {
      const s = 0.55 + this.rnd() * 0.4
      this.sparks.emit(p[0] + (this.rnd() - 0.5) * 0.6, p[1] + 0.02, p[2] + (this.rnd() - 0.5) * 0.6,
        v[0] * s + (this.rnd() - 0.5) * 5, 0.8 + this.rnd() * 2.4, v[2] * s + (this.rnd() - 0.5) * 5, 0.05 + this.rnd() * 0.05, 0.4 + this.rnd() * 0.5)
    }
  }
  puff(x: number, y: number, z: number, v: number[], amount: number) {
    if (this.rnd() > amount) return
    this.smoke.emit(x, y + 0.15, z, v[0] * 0.3 + (this.rnd() - 0.5), 0.6 + this.rnd() * 0.6, v[2] * 0.3 + (this.rnd() - 0.5), 0.5 + this.rnd() * 0.4, 1)
  }
  update(dt: number) { this.sparks.update(dt); this.smoke.update(dt) }
}
