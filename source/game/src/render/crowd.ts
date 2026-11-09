/** Public des tribunes : places extraites de la géométrie réelle (blender/scripts/t10_crowd.py), personnes assises
 *  low-poly instanciées par blocs de 24 m avec deux niveaux de détail (proche : 3 volumes, 36 triangles ; loin :
 *  2 quads, 4 triangles ; au-delà de 700 m : rien). Vêtements variés (teinte par instance), peau et pantalon fixes.
 *  Aucune texture. ?crowd=0 pour comparer (en 2020 le GP s'est couru à huis clos : option « tribunes vides »). */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const SHIRTS = [0xf26b1d, 0xd81e1e, 0xf2f2f2, 0x1a1a1a, 0x1f4fa8, 0x00a19c, 0xffd200, 0x3a3a3a, 0x8a1538, 0x2e7d32, 0xffffff, 0x0b2a5b]
const SKIN = [0xe0b394, 0xc68e6a, 0x8d5a3b, 0xf1c9a5]

function part(g: THREE.BufferGeometry, col: number, fixed: number) {
  const n = g.getAttribute('position').count, c = new THREE.Color(col), C = new Float32Array(n * 3), F = new Float32Array(n).fill(fixed)
  for (let i = 0; i < n; i++) { C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('aFix', new THREE.BufferAttribute(F, 1)); g.deleteAttribute('uv')
  return g
}
function nearGeo() {
  const legs = part(new THREE.BoxGeometry(0.38, 0.16, 0.5).translate(0, 0.38, 0.18), 0x2b2f3a, 1)
  const shins = part(new THREE.BoxGeometry(0.34, 0.42, 0.14).translate(0, 0.21, 0.4), 0x2b2f3a, 1)
  const torso = part(new THREE.BoxGeometry(0.42, 0.56, 0.25).translate(0, 0.74, -0.02), 0xffffff, 0)
  const head = part(new THREE.BoxGeometry(0.19, 0.23, 0.21).translate(0, 1.15, 0), 0xffffff, 2)
  return mergeGeometries([legs, shins, torso, head])!
}
function farGeo() {
  const body = part(new THREE.PlaneGeometry(0.42, 0.95).translate(0, 0.5, 0.05), 0xffffff, 0)
  const head = part(new THREE.PlaneGeometry(0.2, 0.24).translate(0, 1.15, 0.05), 0xffffff, 2)
  return mergeGeometries([body, head])!
}

export class Crowd {
  group = new THREE.Group()
  chunks: { c: THREE.Vector3; near: THREE.InstancedMesh; far: THREE.InstancedMesh }[] = []
  constructor(buf: ArrayBuffer) {
    const n = new Uint32Array(buf, 0, 1)[0], A = new Float32Array(buf, 4, n * 4)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFix; attribute vec3 aSkin;')
        .replace('#include <color_vertex>', `#include <color_vertex>
          #ifdef USE_INSTANCING_COLOR
            vColor.xyz = aFix < 0.5 ? instanceColor.xyz : aFix < 1.5 ? color.xyz : aSkin;
          #endif`)
    }
    mat.customProgramCacheKey = () => 'w11crowd'
    const matFar = mat.clone(); matFar.side = THREE.DoubleSide; matFar.onBeforeCompile = mat.onBeforeCompile; matFar.customProgramCacheKey = () => 'w11crowdF'
    const gN = nearGeo(), gF = farGeo()
    // blocs de 24 m
    const cells = new Map<string, number[]>()
    for (let i = 0; i < n; i++) { const k = Math.floor(A[i * 4] / 24) + ',' + Math.floor(A[i * 4 + 2] / 24); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(i) }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color()
    const hash = (i: number, k: number) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ k * 0x27d4eb2f; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h ^ (h >>> 12)) >>> 0) / 4294967296 }
    for (const ids of cells.values()) {
      const gn = gN.clone(), gf = gF.clone(), skin = new Float32Array(ids.length * 3)
      const near = new THREE.InstancedMesh(gn, mat, ids.length), far = new THREE.InstancedMesh(gf, matFar, ids.length)
      const c = new THREE.Vector3()
      ids.forEach((id, k) => {
        p.set(A[id * 4], A[id * 4 + 1], A[id * 4 + 2]); c.add(p)
        q.setFromAxisAngle(Y, Math.PI - A[id * 4 + 3] + (hash(id, 1) - 0.5) * 0.5)
        const sc = 0.92 + hash(id, 2) * 0.16; s.set(sc, sc * (0.95 + hash(id, 3) * 0.1), sc)
        m.compose(p, q, s); near.setMatrixAt(k, m); far.setMatrixAt(k, m)
        col.setHex(SHIRTS[Math.floor(hash(id, 4) * SHIRTS.length)]).multiplyScalar(0.62 + hash(id, 5) * 0.2); near.setColorAt(k, col); far.setColorAt(k, col)
        col.setHex(SKIN[Math.floor(hash(id, 6) * SKIN.length)]); skin[k * 3] = col.r; skin[k * 3 + 1] = col.g; skin[k * 3 + 2] = col.b
      })
      c.divideScalar(ids.length)
      for (const im of [near, far]) {
        im.geometry.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3)); im.computeBoundingSphere()
        im.receiveShadow = true; im.castShadow = false; im.visible = false; this.group.add(im)
      }
      this.chunks.push({ c, near, far })
    }
    this.group.name = 'crowd'
  }
  update(cam: THREE.Vector3) {
    for (const k of this.chunks) { const d = k.c.distanceTo(cam); k.near.visible = d < 110; k.far.visible = d >= 110 && d < 700 }
  }
}
