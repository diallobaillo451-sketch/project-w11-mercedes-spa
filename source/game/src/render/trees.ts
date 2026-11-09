/** Arbres de la piste (cartes photo croisées trees1/trees2/bushesB) rendus façon « studio » :
 *  - normales sphériques par arbre (couronne éclairée en volume, plus de cartes plates qui changent de teinte) ;
 *  - alpha-to-coverage + alpha affûté (méthode Ben Golus) avec compensation des mipmaps : bords lisses, sans
 *    scintillement et sans arbres qui « fondent » au loin ;
 *  - translucidité en contre-jour, variation de teinte et vent léger (balancement croissant avec la hauteur).
 *  Tout est calculé au chargement de la tuile (union des sommets par arbre) : aucun fichier de piste modifié. */
import * as THREE from 'three'
export const TREE_RE = /^(trees1|trees2|bushesB)/
export const treeUniforms = { uTime: { value: 0 }, uSunV: { value: new THREE.Vector3(0, 1, 0) }, uTrans: { value: 0.7 } }
/** prépare la géométrie : normales sphériques + attribut aTree (fraction de hauteur, graine, amplitude du vent) */
export function prepTreeGeometry(g: THREE.BufferGeometry, bush: boolean) {
  if (g.userData.treePrep) return
  g.userData.treePrep = true
  const pos = g.getAttribute('position') as THREE.BufferAttribute, idx = g.getIndex(), N = pos.count
  const par = new Int32Array(N); for (let i = 0; i < N; i++) par[i] = i
  const find = (a: number) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a }
  const uni = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) par[a] = b }
  if (idx) { const ia = idx.array; for (let t = 0; t < ia.length; t += 3) { uni(ia[t], ia[t + 1]); uni(ia[t], ia[t + 2]) } }
  const key = new Map<string, number>()
  for (let i = 0; i < N; i++) { const k = Math.round(pos.getX(i) * 2) + ',' + Math.round(pos.getZ(i) * 2); const o = key.get(k); if (o != null && Math.abs(pos.getY(o) - pos.getY(i)) < 0.6) uni(i, o); else key.set(k, i) }
  const box = new Map<number, number[]>()
  for (let i = 0; i < N; i++) { const r = find(i); let c = box.get(r); if (!c) box.set(r, c = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9])
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); if (x < c[0]) c[0] = x; if (y < c[1]) c[1] = y; if (z < c[2]) c[2] = z; if (x > c[3]) c[3] = x; if (y > c[4]) c[4] = y; if (z > c[5]) c[5] = z }
  const nrm = new Float32Array(N * 3), at = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const c = box.get(find(i))!, h = Math.max(0.3, c[4] - c[1]), cx = (c[0] + c[3]) / 2, cz = (c[2] + c[5]) / 2
    const cy = c[1] + h * (bush ? 0.3 : 0.62) // centre de la couronne
    let nx = pos.getX(i) - cx, ny = (pos.getY(i) - cy) * 0.6, nz = pos.getZ(i) - cz
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l
    ny = ny * 0.75 + 0.35; const l2 = Math.hypot(nx, ny, nz) || 1 // léger biais vers le ciel (lumière du dessus)
    nrm[i * 3] = nx / l2; nrm[i * 3 + 1] = ny / l2; nrm[i * 3 + 2] = nz / l2
    const hf = Math.max(0, Math.min(1, (pos.getY(i) - c[1]) / h)), seed = (Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1
    at[i * 3] = hf; at[i * 3 + 1] = Math.abs(seed); at[i * 3 + 2] = bush ? 0.03 : Math.min(0.35, 0.012 * h)
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  g.setAttribute('aTree', new THREE.BufferAttribute(at, 3))
}
export function prepTreeMaterial(mt: THREE.MeshStandardMaterial, a2c: boolean) {
  if (mt.userData.tree) return
  mt.userData.tree = true
  mt.alphaToCoverage = a2c
  const cut = mt.alphaTest || 0.5
  if (a2c) mt.alphaTest = 0 // le test alpha est fait dans le shader (affûté) → couverture MSAA
  mt.side = THREE.DoubleSide
  const prev = mt.onBeforeCompile, prevKey = mt.customProgramCacheKey
  mt.onBeforeCompile = (sh, r) => {
    prev.call(mt, sh, r)
    Object.assign(sh.uniforms, treeUniforms, { uCut: { value: cut } })
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aTree; uniform float uTime; varying vec2 vTree;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec4 wp = modelMatrix * vec4(transformed, 1.0);
        float ph = aTree.y * 6.2831 + wp.x * 0.05 + wp.z * 0.04, h2 = aTree.x * aTree.x;
        transformed.x += (sin(uTime * 1.15 + ph) * 0.7 + sin(uTime * 2.7 + ph * 1.7) * 0.3) * aTree.z * h2;
        transformed.z += cos(uTime * 0.95 + ph * 1.3) * 0.6 * aTree.z * h2;
        vTree = aTree.xy; }`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uCut, uTrans; uniform vec3 uSunV; varying vec2 vTree;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= mix(vec3(0.86, 0.9, 0.84), vec3(1.16, 1.12, 1.0), vTree.y) * mix(0.85, 1.05, smoothstep(0.0, 0.5, vTree.x));`)
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, '')) // normales sphériques : pas d'inversion par face
      .replace('#include <alphatest_fragment>', a2c ? `
      #ifdef USE_MAP
      { vec2 sz = vec2(textureSize(map, 0)); vec2 dx = dFdx(vMapUv * sz), dy = dFdy(vMapUv * sz);
        float lod = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
        diffuseColor.a *= 1.0 + lod * 0.28; }               // compense la perte de couverture des mipmaps
      #endif
      diffuseColor.a = clamp((diffuseColor.a - uCut) / max(fwidth(diffuseColor.a), 0.0001) + 0.5, 0.0, 1.0);
      if (diffuseColor.a < 0.02) discard;` : '#include <alphatest_fragment>')
      .replace('#include <opaque_fragment>', `
      { float bl = pow(max(dot(normalize(-vViewPosition), uSunV), 0.0), 5.0);
        outgoingLight += diffuseColor.rgb * vec3(1.0, 0.95, 0.7) * bl * uTrans; }
      #include <opaque_fragment>`)
  }
  mt.customProgramCacheKey = () => (prevKey ? prevKey.call(mt) : '') + '|tree' + (a2c ? 'A' : 'T')
  mt.needsUpdate = true
}
