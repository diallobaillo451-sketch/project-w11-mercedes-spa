/** Bâtiments « trop blancs » : albédo ramené à une valeur de béton/peinture extérieure réelle et salissure procédurale
 *  en coordonnées monde (aucune texture, aucun mémoire GPU en plus) : variation de teinte basse fréquence, coulures
 *  verticales, encrassement plus marqué sur les surfaces horizontales tournées vers le haut. ?weather=0 pour comparer. */
import * as THREE from 'three'

// matériaux clairs du modèle (moyenne sRGB des textures 0,64–0,90, cf. rapport) → facteur d'albédo
const BUILD: [RegExp, number][] = [
  [/^(houses\d+|main-gstand|box1-ppix|box1_map|box1_multimap|box-door|marshal-post)$/, 0.78],
  [/^(concrete-barrie-raw)$/, 0.82],
]
export function weatherKind(name: string): number { const n = name.replace(/\.\d+$/, ''); for (const [re, f] of BUILD) if (re.test(n)) return f; return 0 }

export function applyWeathering(mt: THREE.MeshStandardMaterial) {
  const f = weatherKind(mt.name); if (!f || mt.userData.weather) return false
  mt.userData.weather = true
  const prev = mt.onBeforeCompile, prevKey = mt.customProgramCacheKey
  mt.onBeforeCompile = (sh, r) => {
    prev.call(mt, sh, r)
    sh.uniforms.wF = { value: f }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 ww = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          ww = instanceMatrix * ww;
        #endif
        vWW = (modelMatrix * ww).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal); }`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWW; varying vec3 vWN; uniform float wF;
      float wH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(wH(i), wH(i + vec2(1, 0)), f.x), mix(wH(i + vec2(0, 1)), wH(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 hp = vec2(vWW.x + vWW.z * 0.7, vWW.z - vWW.x * 0.3);
        float big = wN(hp * 0.045) * 0.6 + wN(hp * 0.21 + vWW.y * 0.1) * 0.4;   // taches / reprises de peinture
        float streak = wN(vec2((vWW.x + vWW.z) * 2.3, vWW.y * 0.12)) * wN(vec2((vWW.x - vWW.z) * 0.9, vWW.y * 0.05));
        float up = smoothstep(0.6, 0.95, vWN.y);                              // dessus horizontaux : dépôts
        float g = wF * (0.90 + 0.16 * big) * (1.0 - 0.22 * streak * (1.0 - up)) * (1.0 - 0.15 * up * wN(hp * 0.8));
        diffuseColor.rgb *= g * mix(vec3(1.0), vec3(1.0, 0.97, 0.92), 0.6 * big);  // léger jaunissement
      }`)
  }
  mt.customProgramCacheKey = () => (prevKey ? prevKey.call(mt) : '') + '|wth'
  mt.needsUpdate = true
  return true
}
