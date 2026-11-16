/** Nuit (Marina Bay) : lampadaires lumineux.
 *  - halos : tous les lampadaires dans un seul THREE.Points (sprite additif, taille bornée en pixels, HDR : le bloom fait le reste) ;
 *  - lumières réelles : un nombre FIXE de PointLight (le nombre de lumières est dans la clé de compilation des shaders → jamais
 *    de recompilation en course) posées sur les lampadaires les plus proches de la voiture → flaques de lumière sur la chaussée,
 *    les murs, les bâtiments et la voiture.
 *  Données : lamps.json = { n, p: [x, y, z, …] } (repère du jeu, mètres ; têtes de poteaux extraites du modèle par marina_lamps.py). */
import * as THREE from 'three'

/** réglages d'une scène de nuit (circuit.ts) ; chacun reste surchargeable par l'URL dans renderer.ts (?exp= ?sun= ?env= ?hemi= ?skyI= ?fog=…) */
export interface NightLook {
  /** lumière de lune : intensité (lux de la DirectionalLight) et teinte (0xRRGGBB) */
  moon: number; moonColor: number
  /** exposition (ACES), IBL du dôme, hémisphère, intensité du dôme de ciel, densité du brouillard exponentiel */
  exp: number; env: number; hemi: number; skyI: number; fog: number
  /** intensité du disque lunaire du dôme (uSunI ; 0 = pas de disque) */
  moonDisk: number
  /** halos : intensité (HDR) et rayon (m) ; lumières réelles : intensité (cd), portée (m) */
  glow: number; glowSize: number; lampI: number; lampRange: number
}

export interface LampData { n: number; p: number[] }

const VS = /* glsl */`
uniform float uScale, uSize, uMinPx, uMaxPx;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(-mv.z, 1.0);
  float px = 2.0 * uSize * uScale / d;
  gl_PointSize = clamp(px, uMinPx, uMaxPx);
  // plus petit que le plancher : même taille mais moins brillant (point lointain) ; tout près de la caméra : moins éblouissant
  vFade = clamp(px / uMinPx, 0.35, 1.0) * mix(0.3, 1.0, smoothstep(3.0, 16.0, d));
  gl_Position = projectionMatrix * mv;
}`
const FS = /* glsl */`
uniform vec3 uColor; uniform float uI;
varying float vFade;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 34.0), halo = exp(-r2 * 6.0) * 0.16;
  float f = (core * 5.0 + halo) * vFade * (1.0 - smoothstep(0.7, 1.0, r2));
  vec3 c = mix(uColor, vec3(1.0), clamp(core, 0.0, 1.0)) * f * uI;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export class NightLamps {
  readonly group = new THREE.Group()
  /** lumières réelles (nombre fixe) */
  readonly lights: THREE.PointLight[] = []
  readonly n: number
  private pos: Float32Array
  private slot: Int32Array
  private mat: THREE.ShaderMaterial
  private pts: THREE.Points
  private best: number[] = []; private bestD: number[] = []
  private look: NightLook

  constructor(data: LampData, look: NightLook, lightCount: number) {
    this.look = look
    this.n = Math.min(data.n, Math.floor(data.p.length / 3))
    this.pos = Float32Array.from(data.p.slice(0, this.n * 3))
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uScale: { value: 900 }, uSize: { value: look.glowSize }, uMinPx: { value: 5 }, uMaxPx: { value: 200 },
        uColor: { value: new THREE.Color(1.0, 0.82, 0.55) }, uI: { value: look.glow } },
    })
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; this.pts.name = 'lamp_glow'
    this.group.add(this.pts); this.group.name = 'night_lamps'
    for (let i = 0; i < lightCount; i++) {
      const l = new THREE.PointLight(0xffe2b8, 0, look.lampRange, 2); l.castShadow = false; l.name = 'lamp_light_' + i
      this.lights.push(l); this.group.add(l)
    }
    this.slot = new Int32Array(lightCount).fill(-1)
  }

  /** à chaque image : recale la taille des halos sur la résolution et attribue les lumières aux lampadaires les plus proches du point `focus` */
  update(focus: THREE.Vector3, cam: THREE.PerspectiveCamera, heightPx: number) {
    const u = this.mat.uniforms, k = heightPx / 1080
    u.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))
    u.uMinPx.value = Math.max(3, 5 * k); u.uMaxPx.value = 200 * k
    const K = this.lights.length; if (!K) return
    const P = this.pos, fx = focus.x, fy = focus.y, fz = focus.z
    const best = this.best, bd = this.bestD; best.length = 0; bd.length = 0
    for (let i = 0; i < this.n; i++) {
      const dx = P[i * 3] - fx, dy = P[i * 3 + 1] - fy, dz = P[i * 3 + 2] - fz, d = dx * dx + dy * dy + dz * dz
      if (best.length === K && d >= bd[K - 1]) continue
      let j = best.length < K ? best.length : K - 1
      while (j > 0 && bd[j - 1] > d) { if (j < K) { best[j] = best[j - 1]; bd[j] = bd[j - 1] } j-- }
      best[j] = i; bd[j] = d
    }
    // les lampadaires déjà éclairés gardent leur lumière ; les nouveaux prennent les lumières libres (pas de saut de lumière, pas d'allocation)
    const S = this.slot
    for (let s = 0; s < K; s++) if (S[s] >= 0 && best.indexOf(S[s]) < 0) S[s] = -1
    for (const i of best) {
      if (S.includes(i)) continue
      const f = S.indexOf(-1); if (f < 0) break
      S[f] = i
    }
    for (let q = 0; q < K; q++) {
      const l = this.lights[q], i = S[q]
      if (i < 0) { l.intensity = 0; continue }
      l.position.set(P[i * 3], P[i * 3 + 1] - 0.6, P[i * 3 + 2]); l.intensity = this.look.lampI
    }
  }
  setGlow(v: number) { this.mat.uniforms.uI.value = v }
  dispose() { this.pts.geometry.dispose(); this.mat.dispose(); for (const l of this.lights) l.dispose() }
}

/** lamps.json (têtes de lampadaires) ; null si absent → pas de halos ni de lumières (la scène reste éclairée par l'émission des matériaux) */
export async function loadLamps(url: string): Promise<LampData | null> {
  try {
    const r = await fetch(url); if (!r.ok) return null
    const d = await r.json() as LampData
    return Array.isArray(d.p) && d.p.length >= 3 ? d : null
  } catch { return null }
}
