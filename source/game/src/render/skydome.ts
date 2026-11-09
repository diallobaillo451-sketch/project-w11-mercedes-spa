/** Ciel photographique HDRI (Poly Haven « Kloofendal 48d Partly Cloudy (Pure Sky) », CC0 ; tools/make_sky.py).
 *  Dôme collé au plan lointain (z = w, rotation de vue seule), décodage HDR x/(1+x) → radiance linéaire avant tone mapping, soleil analytique
 *  (le disque photographié est retiré : la lumière directe vient de la DirectionalLight, pas de double compte),
 *  légère brume d'horizon accordée au brouillard de la scène. Même shader (sans soleil) pour l'IBL préfiltrée (PMREM). */
import * as THREE from 'three'

export interface SkyMeta { scale: number; vMax: number; sun: { u: number; v: number; elev: number }; horizon: number[] }
const VS = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position.z = gl_Position.w; } // indépendant de la position de la caméra (sondes cube comprises)`
const FS = /* glsl */`
uniform sampler2D tSky; uniform float uS, uVMax, uUOff, uI, uSunI, uHaze; uniform vec3 uSunDir, uFog;
varying vec3 vDir;
const float PI = 3.141592653589793;
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5 + uUOff;
  float vr = clamp((PI * 0.5 - el) / PI / uVMax, 0.0, 0.999);
  vec2 uv = vec2(u, 1.0 - vr), gx = dFdx(uv), gy = dFdy(uv);
  gx.x -= floor(gx.x + 0.5); gy.x -= floor(gy.x + 0.5); // pas de couture à la jonction 0/1 de l'équirectangulaire
  vec3 e = min(textureGrad(tSky, uv, gx, gy).rgb, vec3(0.996));
  vec3 L = e / (1.0 - e) * uS * uI;
  // sous l'horizon (rarement visible : relief, arbres) : ligne d'horizon assombrie
  L *= mix(0.55, 1.0, smoothstep(-0.10, 0.0, el));
  // brume d'horizon (perspective aérienne) : même couleur que le brouillard de la scène
  L = mix(L, uFog, uHaze * exp(-max(el, 0.0) * 9.0));
  // soleil : disque (0,27°) + halo serré (le bloom fait l'éblouissement)
  float c = dot(d, uSunDir);
  L += uSunI * (smoothstep(0.999985, 0.999992, c) * 60.0 + pow(max(c, 0.0), 1800.0) * 3.0 + pow(max(c, 0.0), 90.0) * 0.12);
  gl_FragColor = vec4(L, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export class SkyDome {
  mesh: THREE.Mesh; mat: THREE.ShaderMaterial; meta: SkyMeta; tex: THREE.Texture
  /** direction du soleil (monde) pour un azimut voulu ; l'élévation est celle de la photo */
  sunDir = new THREE.Vector3()
  constructor(tex: THREE.Texture, meta: SkyMeta, azimuthDeg: number, intensity: number) {
    this.tex = tex; this.meta = meta
    const el = THREE.MathUtils.degToRad(meta.sun.elev)
    this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - el, THREE.MathUtils.degToRad(azimuthDeg))
    // décalage u pour que le soleil photographié tombe sur sunDir : u(d) = atan(z, x)/2π + 0,5 + off
    const uWant = Math.atan2(this.sunDir.z, this.sunDir.x) / (2 * Math.PI) + 0.5
    const hz = meta.horizon
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
      uniforms: { tSky: { value: tex }, uS: { value: meta.scale }, uVMax: { value: meta.vMax }, uUOff: { value: meta.sun.u - uWant }, uI: { value: intensity },
        uSunI: { value: 1 }, uHaze: { value: 0.35 }, uSunDir: { value: this.sunDir }, uFog: { value: new THREE.Vector3(hz[0], hz[1], hz[2]).multiplyScalar(intensity) } } })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), this.mat)
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -10; this.mesh.name = 'skydome'
  }
  /** couleur de brouillard (linéaire, avant tone mapping) = horizon photographié */
  fogColor(): THREE.Color { const v = this.mat.uniforms.uFog.value as THREE.Vector3; return new THREE.Color(v.x, v.y, v.z) }
  /** IBL : cube préfiltré depuis le même ciel, sans soleil, avec un sol neutre */
  envMap(r: THREE.WebGLRenderer, groundColor: number): THREE.Texture {
    const pm = new THREE.PMREMGenerator(r), sc = new THREE.Scene()
    const m2 = this.mat.clone(); m2.uniforms.uSunI.value = 0; m2.uniforms.uHaze.value = 0.2
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), m2))
    const g = new THREE.Mesh(new THREE.CircleGeometry(90, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: groundColor })); g.position.y = -2; sc.add(g)
    const env = pm.fromScene(sc, 0.02).texture
    pm.dispose(); m2.dispose(); g.geometry.dispose(); (g.material as THREE.Material).dispose()
    return env
  }
}

export async function loadSky(base: string, mobile: boolean, an: number, ktx?: { loadAsync(u: string): Promise<THREE.Texture> } | null): Promise<{ tex: THREE.Texture; meta: SkyMeta }> {
  const meta = await (await fetch(base + 'sky.json')).json() as SkyMeta
  // ciel 4K en KTX2 (ASTC/BC7 côté GPU : ~6 Mo au lieu de ~24 Mo de WebP décodé), WebP en secours
  let tex: THREE.Texture | null = null
  if (ktx && !mobile) { try { tex = await ktx.loadAsync(base + 'sky_4k.ktx2'); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = an; return { tex, meta } } catch { tex = null } }
  tex = await new THREE.TextureLoader().loadAsync(base + (mobile ? 'sky_2k.webp' : 'sky_4k.webp'))
  tex.colorSpace = THREE.NoColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = an; tex.generateMipmaps = true
  return { tex, meta }
}
