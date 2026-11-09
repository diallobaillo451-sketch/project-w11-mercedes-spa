/** Occlusion ambiante PRÉCALCULÉE (Cycles, lancer de rayons hors ligne : blender/scripts/r1_bake_ao_track.py) stockée par
 *  sommet dans COLOR_0 de la piste. Appliquée seulement à l'éclairage indirect (ciel/IBL, comme aoMap de three.js),
 *  plus une petite part sur la lumière directe (au-delà de la carte d'ombre temps réel, qui ne couvre que ±30 m autour
 *  de la voiture). Coût GPU : 1 attribut + quelques instructions → compatible iPhone. Valeurs de dosage = E (réglage visuel). */
import * as THREE from 'three'
/** sols : triangles très grands → AO par sommet interpolé sur des mètres ; dosage réduit pour éviter des dégradés visibles */
const GROUND = /^(asph|asph_new|asph-grv|asph_pitlane_old|asph-pitlane-old|road-ext-tile|groove\d?|groove_custom|line|kerb_new|CURB_B|carpet|carpet-full|carpet-blue|grass-side1|GRASS|sand|sand_new|Parking|new_AO|asph_patch_joint|diss2)(\.\d+)?$/
export interface BakedAOOpts { strength: number; ground: number; direct: number; floor: number }
export const BAKED_AO_DEFAULT: BakedAOOpts = { strength: 1.0, ground: 0.55, direct: 0.3, floor: 0.22 }
export function applyBakedAO(root: THREE.Object3D, o: BakedAOOpts = BAKED_AO_DEFAULT): { meshes: number; materials: number } {
  const done = new Map<THREE.Material, THREE.Material>(); let meshes = 0
  root.traverse(obj => {
    const m = obj as THREE.Mesh
    if (!m.isMesh) return
    const g = m.geometry as THREE.BufferGeometry, col = g.getAttribute('color')
    if (!col) return
    g.setAttribute('aoBake', col); g.deleteAttribute('color'); meshes++
    const one = (mt: THREE.Material) => {
      let c = done.get(mt)
      if (c) return c
      const s = mt as THREE.MeshStandardMaterial
      s.vertexColors = false
      const k = GROUND.test(s.name) ? o.ground : o.strength
      s.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aoBake;\nvarying float vBakedAO;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBakedAO = aoBake.r;')
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBakedAO;')
          .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          {
            float bao = max(${o.floor.toFixed(3)}, mix(1.0, vBakedAO, ${k.toFixed(3)}));
            reflectedLight.indirectDiffuse *= bao;
            reflectedLight.directDiffuse *= mix(1.0, bao, ${o.direct.toFixed(3)});
            #if defined( USE_ENVMAP ) && defined( STANDARD )
              reflectedLight.indirectSpecular *= computeSpecularOcclusion( saturate( dot( geometryNormal, geometryViewDir ) ), bao, material.roughness );
            #endif
          }`)
      }
      s.customProgramCacheKey = () => 'bakedAO' + k
      s.needsUpdate = true
      done.set(mt, s); return s
    }
    m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material)
  })
  return { meshes, materials: done.size }
}
/** retire l'AO (attribut COLOR_0) : rendu de référence « sans AO » (?bao=0) */
export function stripBakedAO(root: THREE.Object3D) {
  root.traverse(obj => { const m = obj as THREE.Mesh; if (!m.isMesh || !m.geometry.getAttribute('color')) return
    m.geometry.deleteAttribute('color'); for (const mt of (Array.isArray(m.material) ? m.material : [m.material])) { (mt as THREE.MeshStandardMaterial).vertexColors = false; mt.needsUpdate = true } })
}
