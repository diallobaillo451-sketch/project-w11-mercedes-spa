/** Détail PBR de près pour le gravier et l'herbe (textures CC0 ambientCG Gravel023 / Grass001, 1024², KTX2 sur mobile) :
 *  projection monde (x, z), deux échelles mélangées contre la répétition, multiplication normalisée de l'albédo d'origine
 *  (la couleur d'ensemble du circuit est conservée) + normale de détail ; fondu avec la distance (au-delà : rendu d'origine).
 *  Coût : 4 lectures de texture sur ces seuls matériaux. */
import * as THREE from 'three'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
export type DetailKind = 'gravel' | 'grass'
const KIND: [RegExp, DetailKind][] = [
  [/^(sand|sand_new|construction_dirt)(\.\d+)?$/, 'gravel'],
  [/^(GRASS|grass-side1|grass-side1B|grass-side2|grass-side4|grass-ext-shad|sbancamento_D)(\.\d+)?$/, 'grass'],
]
/** taille d'un motif (m), force albédo, force normale, couleur moyenne du motif (linéaire, mesurée), distance de fondu */
const P: Record<DetailKind, { size: number; alb: number; nrm: number; fade: number }> = {
  gravel: { size: 1.4, alb: 0.85, nrm: 0.9, fade: 45 },
  grass: { size: 1.8, alb: 0.6, nrm: 0.6, fade: 35 },
}
export interface DetailSet { tex: Record<DetailKind, { col: THREE.Texture; nrm: THREE.Texture; mean: THREE.Vector3 }> }
async function load(url: string, ktx: KTX2Loader | null, srgb: boolean, an: number) {
  let t: THREE.Texture
  if (ktx) { try { t = await ktx.loadAsync(url + '.ktx2') } catch { t = await new THREE.TextureLoader().loadAsync(url + '.webp') } }
  else t = await new THREE.TextureLoader().loadAsync(url + '.webp')
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = an
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  if (!(t as THREE.CompressedTexture).isCompressedTexture) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter }
  t.needsUpdate = true
  return t
}
export async function loadDetail(base: string, ktx: KTX2Loader | null, an: number): Promise<DetailSet> {
  const out = {} as DetailSet['tex']
  // couleurs moyennes linéaires des motifs (mesurées sur les fichiers, tools/make_detail.mjs)
  const MEAN: Record<DetailKind, [number, number, number]> = { gravel: [0.489, 0.471, 0.436], grass: [0.047, 0.084, 0.018] }
  for (const k of ['gravel', 'grass'] as DetailKind[]) {
    const [col, nrm] = await Promise.all([load(base + k + '_col', ktx, true, an), load(base + k + '_nrm', ktx, false, an)])
    out[k] = { col, nrm, mean: new THREE.Vector3(...MEAN[k]) }
  }
  return { tex: out }
}
export function detailKind(name: string): DetailKind | null { const n = name; for (const [re, k] of KIND) if (re.test(n)) return k; return null }
/** branche le détail sur un matériau (chaîné avec les autres modifications de shader, ex. AO cuite) */
export function applyDetail(mt: THREE.MeshStandardMaterial, set: DetailSet) {
  const k = detailKind(mt.name); if (!k || mt.userData.detail) return false
  mt.userData.detail = k
  const d = set.tex[k], p = P[k], prev = mt.onBeforeCompile, prevKey = mt.customProgramCacheKey
  mt.onBeforeCompile = (sh, r) => {
    prev.call(mt, sh, r)
    sh.uniforms.dCol = { value: d.col }; sh.uniforms.dNrm = { value: d.nrm }; sh.uniforms.dMean = { value: d.mean }
    sh.uniforms.dP = { value: new THREE.Vector4(1 / p.size, p.alb, p.nrm, p.fade) }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 dw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dw = instanceMatrix * dw;
        #endif
        vDW = (modelMatrix * dw).xyz; }`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vDW; uniform sampler2D dCol; uniform sampler2D dNrm; uniform vec3 dMean; uniform vec4 dP;
      float dW; vec2 dUV1; vec2 dUV2;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float dist = length(vDW - cameraPosition);
        dW = 1.0 - smoothstep(dP.w * 0.35, dP.w, dist);
        dUV1 = vDW.xz * dP.x; dUV2 = mat2(0.8, -0.6, 0.6, 0.8) * vDW.xz * dP.x * 0.37 + 0.17;
        if (dW > 0.0) {
          vec3 c = 0.6 * texture2D(dCol, dUV1).rgb + 0.4 * texture2D(dCol, dUV2).rgb;
          vec3 m = c / max(dMean, vec3(0.005));
          diffuseColor.rgb *= mix(vec3(1.0), clamp(m, 0.0, 2.5), dW * dP.y);
        }
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (dW > 0.0) {
        vec3 tn = 0.6 * (texture2D(dNrm, dUV1).xyz * 2.0 - 1.0) + 0.4 * (texture2D(dNrm, dUV2).xyz * 2.0 - 1.0);
        // repère tangent du sol projeté : u = +x monde, v = +z monde (normale OpenGL : vert = +v)
        vec3 pert = (viewMatrix * vec4(tn.x, 0.0, tn.y, 0.0)).xyz;
        normal = normalize(normal + pert * dW * dP.z);
      }`)
  }
  mt.customProgramCacheKey = () => (prevKey ? prevKey.call(mt) : '') + '|det' + k
  mt.needsUpdate = true
  return true
}
