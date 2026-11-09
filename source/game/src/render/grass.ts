/** Herbe 3D instanciée au bord de la piste (touffes procédurales, aucune texture externe).
 *  Les touffes sont placées une fois pour toutes sur les cellules « herbe » de la grille physique (|d| < 16 m),
 *  triées par station ; à chaque image on ne garde que la fenêtre autour de la caméra (copie de sous-tableau,
 *  pas d'allocation). Hauteur 8–20 cm (herbe tondue de Spa), balancement au vent, fondu en distance. */
import * as THREE from 'three'
import type { TrackSurface } from '../track/surface.ts'

const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

function bladeAlpha(): THREE.DataTexture {
  // 128×128 : 16 brins fins effilés, légèrement courbés (alpha testé), dégradé de teinte vers la pointe dans le canal R
  const W = 128, d = new Uint8Array(W * W * 4)
  for (let b = 0; b < 16; b++) {
    const x0 = (b + 0.5) / 16 * W + (hash(b, 7) - 0.5) * 6, w0 = 1.7 + hash(b, 3) * 1.2, top = 0.3 + hash(b, 5) * 0.7, bend = (hash(b, 9) - 0.5) * 34
    for (let y = 0; y < W; y++) { const t = y / W; if (t > top) break
      const k = t / top, cx = x0 + bend * k * k, hw = w0 * (1 - k) + 0.4
      for (let x = Math.max(0, Math.floor(cx - hw)); x <= Math.min(W - 1, Math.ceil(cx + hw)); x++) {
        const o = ((W - 1 - y) * W + x) * 4; d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = 255 }
    }
  }
  const t = new THREE.DataTexture(d, W, W); t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true
  return t
}

export class Grass {
  mesh: THREE.InstancedMesh
  /** positions triées par station : x, y, z, (rotation + échelle) */
  all: Float32Array; start: Int32Array; n: number
  cap: number; lastI = -1
  uTime = { value: 0 }
  surf: TrackSurface; range: number
  constructor(surf: TrackSurface, mask: ArrayBuffer, density: number, cap: number, range = 34, det: { col: THREE.Texture; mean: THREE.Vector3 } | null = null) {
    this.surf = surf; this.range = range
    const N = surf.N, ND = surf.ND, D0 = surf.D0, DS = surf.DS
    // masque (tools/coll/grassmask.py) : classe d'herbe par cellule (0 rien, 1 GRASS, 2 grass-side1/4, 3 grass-side2),
    // déjà filtré (matériau d'herbe verte, pente faible) ; 4 bits par cellule sur les colonnes [C0, C0+W)
    const hd = new Uint16Array(mask, 0, 2), C0 = hd[0], W = hd[1], mb = new Uint8Array(mask, 4)
    const cls = (i: number, j: number) => { const k = j - C0; if (k < 0 || k >= W) return 0; const b = mb[i * (W >> 1) + (k >> 1)]; return k & 1 ? b >> 4 : b & 15 }
    const buf: number[] = []; this.start = new Int32Array(N + 1)
    for (let i = 0; i < N; i++) {
      this.start[i] = buf.length / 4
      const tx = surf.tx[i], tz = surf.tz[i], tn = Math.hypot(tx, tz) || 1, Rx = -tz / tn, Rz = tx / tn
      for (let j = 0; j < ND; j++) {
        const d = D0 + j * DS; if (Math.abs(d) > 16 || Math.abs(d) < 2) continue
        const c = cls(i, j); if (!c) continue
        // bordure : pas de touffes collées à un autre sol (vibreur, gravier, asphalte, herbe sèche) → rien « dans » la piste
        if (!cls(i, j - 2) || !cls(i, j + 2)) continue
        if (hash(i, j) > density) continue
        const u = hash(j, i * 3 + 1), v = hash(i * 7, j + 5)
        const dd = d + (v - 0.5) * DS
        const i1 = (i + 1) % N, x = surf.cx[i] + (surf.cx[i1] - surf.cx[i]) * u + dd * Rx, z = surf.cz[i] + (surf.cz[i1] - surf.cz[i]) * u + dd * Rz
        const y = surf.cy[i] + (surf.cy[i1] - surf.cy[i]) * u + surf.H[i * ND + j]
        // évite les doublons dans les épingles : la station la plus proche doit être i
        const pi = Math.abs(surf.project(x, z, i).i - i); if (pi > 2 && pi < N - 2) continue
        buf.push(x, y, z, c * 1000 + Math.floor(hash(i + 11, j) * 628) + Math.min(0.99, 0.45 + hash(j + 3, i) * 0.55))
      }
    }
    this.start[N] = buf.length / 4
    this.all = Float32Array.from(buf); this.n = buf.length / 4; this.cap = cap
    // géométrie : 3 plans croisés de 18 cm, hauteur 1 (mise à l'échelle par instance)
    const g = new THREE.BufferGeometry(), P: number[] = [], U: number[] = [], I: number[] = []
    for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3, c = Math.cos(a) * 0.09, sn = Math.sin(a) * 0.09, b = P.length / 3
      P.push(-c, 0, -sn, c, 0, sn, c, 1, sn, -c, 1, -sn); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(b, b + 1, b + 2, b, b + 2, b + 3) }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, q) => q % 3 === 1 ? 1 : 0), 3)); g.setIndex(I)
    const inst = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); inst.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('aTuft', inst)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    const mt = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, alphaMap: bladeAlpha(), alphaTest: 0.5, side: THREE.DoubleSide })
    const uT = this.uTime, R = range
    mt.onBeforeCompile = sh => {
      sh.uniforms.uTime = uT; sh.uniforms.gCol = { value: det?.col ?? null }; sh.uniforms.gMean = { value: det?.mean ?? new THREE.Vector3(1, 1, 1) }
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aTuft; uniform float uTime; varying float vGT; varying float vGF; varying vec3 vTint; varying vec2 vGW;')
        .replace('#include <begin_vertex>', `
          float cl = floor(aTuft.w / 1000.0), rot = floor(aTuft.w - cl * 1000.0) * 0.01, sc = fract(aTuft.w);
          vTint = cl < 1.5 ? vec3(0.36, 0.40, 0.21) : cl < 2.5 ? vec3(0.34, 0.32, 0.20) : vec3(0.40, 0.38, 0.25);
          vTint *= 0.8 + 0.18 * fract(sin(dot(aTuft.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float ca = cos(rot), sa = sin(rot);
          vec3 transformed = vec3(ca * position.x - sa * position.z, position.y * (0.07 + 0.11 * sc), sa * position.x + ca * position.z) * (0.8 + 0.4 * sc);
          float dc = distance(aTuft.xz, cameraPosition.xz); vGF = (1.0 - smoothstep(${(R * 0.6).toFixed(1)}, ${R.toFixed(1)}, dc)) * smoothstep(1.2, 3.0, distance(aTuft.xyz, cameraPosition));
          transformed *= max(vGF, 0.0);
          float wv = sin(uTime * 1.7 + aTuft.x * 0.35 + aTuft.z * 0.27) * 0.5 + sin(uTime * 3.1 + aTuft.z * 0.9) * 0.25;
          transformed.xz += position.y * position.y * wv * 0.035;
          transformed += aTuft.xyz; vGW = transformed.xz; vGT = uv.y;`)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vec3(0.0, 1.0, 0.0);')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGT; varying float vGF; varying vec3 vTint; varying vec2 vGW;' + (det ? '\nuniform sampler2D gCol; uniform vec3 gMean;\n#define GDET' : ''))
        .replace('#include <alphamap_fragment>', 'float gA = texture2D(alphaMap, vAlphaMapUv).g; diffuseColor.a *= clamp((gA - 0.5) / max(fwidth(gA), 1e-4) + 0.5, 0.0, 1.0);')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = pow(vTint, vec3(2.2)) * mix(0.7, 1.08, vGT);\n#ifdef GDET\ndiffuseColor.rgb *= mix(vec3(1.0), clamp(texture2D(gCol, vGW / 1.8).rgb / gMean, 0.0, 2.5), 0.85);\n#endif')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));')
    }
    mt.customProgramCacheKey = () => 'w11grass'
    this.mesh = new THREE.InstancedMesh(g, mt, cap); this.mesh.count = 0; this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true; this.mesh.castShadow = false; this.mesh.name = 'grass3d'
    // matrices d'instance = identité (la position vient de aTuft)
    const m = new THREE.Matrix4(); for (let k = 0; k < cap; k++) this.mesh.setMatrixAt(k, m)
  }
  /** fenêtre de stations autour de la caméra ; mise à jour quand la station change */
  update(cam: THREE.Vector3, hint: number, t: number) {
    this.uTime.value = t
    const i = this.surf.project(cam.x, cam.z, hint).i
    if (i === this.lastI) return
    this.lastI = i
    const N = this.surf.N, w = Math.ceil(this.range / this.surf.ds) + 2
    const dst = (this.mesh.geometry.getAttribute('aTuft') as THREE.InstancedBufferAttribute)
    const arr = dst.array as Float32Array; let n = 0
    const copy = (a: number, b: number) => { const s0 = this.start[a], s1 = this.start[b]; const k = Math.min(s1 - s0, this.cap - n); if (k <= 0) return
      arr.set(this.all.subarray(s0 * 4, (s0 + k) * 4), n * 4); n += k }
    const a = i - w, b = i + w + 1
    if (a >= 0 && b <= N) copy(a, b)
    else if (a < 0) { copy(N + a, N); copy(0, b) }
    else { copy(a, N); copy(0, b - N) }
    this.mesh.count = n; dst.needsUpdate = true; dst.clearUpdateRanges(); dst.addUpdateRange(0, n * 4)
  }
}
