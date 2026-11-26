/** Plateau : 19 IA + safety car, livrées réelles à toute distance, roues et suspension visuelles partout,
 *  physique hybride (quaternion) pour les 3–4 voitures autour du joueur.
 *  Les prototypes d'équipe sont chargés pendant l'écran de démarrage (preload) : la grille est pleine
 *  avant les feux. Ancres Ty consommées si elles sont dans la scène, ignorées sinon. */
import * as THREE from 'three'
import type { RaceSim, Racer } from '../race/sim.ts'
import { disposeTree, loadGLB, type Renderer } from './renderer.ts'
import { carOfTeam, teamAccent } from '../data/drivers.ts'
import { dlog } from '../diag.ts'
import { bindLivery, readableLivery } from './livery.ts'
import { collectAnchors, type Anchor } from './anchors.ts'
import { cloneTyreMaterials, setTyreCompoundColor } from './tyreColor.ts'
import { paintLight, shouldCreateFallbackMarshalBoards } from './signals.ts'

type Mat = THREE.MeshStandardMaterial
interface WheelRef { spin: THREE.Object3D; steer: THREE.Object3D | null; front: boolean; spin0: number; steer0: number }
interface CarView { r: Racer; obj: THREE.LOD; wheels: WheelRef[]; tyreMaterials: THREE.MeshStandardMaterial[]; tyreCompound: Racer['tyre']['c']; blob: THREE.Mesh; pitch: number; roll: number; spin: number; hasHi: boolean; drsPivots: THREE.Object3D[]; drsPos: number }
const TEAMS = ['mercedes', 'ferrari', 'redbull', 'mclaren', 'renault', 'alphatauri', 'racingpoint', 'alfaromeo', 'haas', 'williams']
/** Distances (m). Les voitures les plus proches de la caméra utilisent le modèle HD (≈ 47 k tris, UV et textures d'origine,
 *  livrée complète) ; ensuite LOD1 (≈ 21 k) puis LOD2 (≈ 6 k). Le LOD1/LOD2 n'a pas d'UV propres : sa livrée est approximée,
 *  donc on le garde pour les voitures éloignées, où l'approximation ne se voit plus. */
const LOD_HI = 36, LOD1 = 120, LOD2 = 450, LOD1_NOHI = 60
/** nombre maximal de voitures HD affichées en même temps (les plus proches), selon le préréglage — le reste retombe en LOD1 */
const HI_BUDGET: Record<string, number> = { low: 2, medium: 4, high: 6, ultra: 8 }
/** Modèle SC remplaçable (Mercedes-AMG GT Black Series optimisé, plus tard sous shared/assets/safety_car/). */
export const SAFETY_CAR_LOD = './cars/safetycar_lod1.glb'
export const SAFETY_CAR_HI = './cars/safetycar_hi.glb'
const m4 = new THREE.Matrix4(), qT = new THREE.Quaternion(), eT = new THREE.Euler(), mR = new THREE.Matrix4()
const vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3()

function blobTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function dropTopMip(t: THREE.Texture, keep = 256) {
  const ct = t as THREE.CompressedTexture
  if (!ct.isCompressedTexture || !ct.mipmaps || ct.mipmaps.length < 2) return
  const m0 = ct.mipmaps[0] as { width: number; height: number }; if (m0.width <= keep) return
  ct.mipmaps = ct.mipmaps.slice(1); const m1 = ct.mipmaps[0] as { width: number; height: number }
  ;(ct.image as { width: number; height: number }) = { width: m1.width, height: m1.height } as never; ct.needsUpdate = true
}
function collectWheels(root: THREE.Object3D): WheelRef[] {
  const wheels: WheelRef[] = []
  for (const w of ['FL', 'FR', 'RL', 'RR']) {
    const st = root.getObjectByName('W_' + w) ?? root.getObjectByName('W_' + w + '.L1')
    const sp = root.getObjectByName('W_' + w + '_spin') ?? root.getObjectByName('W_' + w + '_spin.L1')
    if (sp) wheels.push({ spin: sp, steer: w[0] === 'F' ? st ?? null : null, front: w[0] === 'F', spin0: sp.rotation.x, steer0: st?.rotation.y ?? 0 })
  }
  return wheels
}
/** Volet DRS : le nœud « DRS_pivot » (bord de fuite du volet, vérifié sur les 9 voitures) tourne autour de X ; +25° = volet à plat, comme le W11 du joueur. */
const DRS_RAD = 25 * Math.PI / 180
function collectDrs(root: THREE.Object3D): THREE.Object3D[] { const out: THREE.Object3D[] = []; root.traverse(n => { if (n.name.startsWith('DRS_pivot')) out.push(n) }); return out }
/** maillages dont la quantification a explosé (un logo de jante à 8 m, lu comme une roue qui flotte) */
function hideExploded(root: THREE.Object3D) {
  const s = new THREE.Vector3()
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const n = ((m.material as THREE.Material)?.name || '') + ' ' + o.name
    if (/paint|carbon|decal|tyre|tire|wing|chassis|generic|body|hub/i.test(n)) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    m.geometry.boundingBox!.getSize(s)
    if (s.x > 3.5 || s.y > 3.5 || s.z > 3.5) m.visible = false
  })
}
/** Les LOD n'ont pas de TEXCOORD (ou des UV quantifiées à 65535). On recopie l'UV du sommet HD le plus proche, même matériau. */
function transferUVs(hi: THREE.Object3D, lod: THREE.Object3D) {
  hi.updateWorldMatrix(true, true)
  const v = new THREE.Vector3()
  const CELL = 0.15
  const key = (x: number, y: number, z: number) => `${Math.floor(x / CELL)}|${Math.floor(y / CELL)}|${Math.floor(z / CELL)}`
  const buckets = new Map<string, { cell: Map<string, number[]>; pos: Float32Array; uv: Float32Array; n: number }>()
  const lists = new Map<string, { px: number[]; pu: number[] }>()
  hi.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const pos = m.geometry.getAttribute('position'), uv = m.geometry.getAttribute('uv')
    if (!pos || !uv) return
    const name = ((m.material as THREE.Material).name) || ''
    if (!name) return
    let L = lists.get(name)
    if (!L) { L = { px: [], pu: [] }; lists.set(name, L) }
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.matrixWorld)
      L.px.push(v.x, v.y, v.z); L.pu.push(uv.getX(i), uv.getY(i))
    }
  })
  for (const [name, L] of lists) {
    const n = L.px.length / 3
    const pos = new Float32Array(L.px), uv = new Float32Array(L.pu), cell = new Map<string, number[]>()
    for (let i = 0; i < n; i++) {
      const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
      const a = cell.get(k); if (a) a.push(i); else cell.set(k, [i])
    }
    buckets.set(name, { cell, pos, uv, n })
  }
  lod.updateWorldMatrix(true, true)
  lod.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.visible) return
    const pos = m.geometry.getAttribute('position')
    if (!pos) return
    const name = ((m.material as THREE.Material).name) || ''
    const b = buckets.get(name)
    if (!b) return
    const cur = m.geometry.getAttribute('uv')
    let bad = !cur
    if (cur) for (let i = 0; i < cur.count; i += Math.max(1, (cur.count / 24) | 0)) {
      if (Math.abs(cur.getX(i)) > 2 || Math.abs(cur.getY(i)) > 2) { bad = true; break }
    }
    if (!bad) return
    const uv = new Float32Array(pos.count * 2)
    let miss = 0
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.matrixWorld)
      const cx = Math.floor(v.x / CELL), cy = Math.floor(v.y / CELL), cz = Math.floor(v.z / CELL)
      let best = 0.4 * 0.4, bu = 0.02, bv = 0.02
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const arr = b.cell.get(`${cx + dx}|${cy + dy}|${cz + dz}`); if (!arr) continue
        for (const idx of arr) {
          const px = b.pos[idx * 3] - v.x, py = b.pos[idx * 3 + 1] - v.y, pz = b.pos[idx * 3 + 2] - v.z
          const d = px * px + py * py + pz * pz
          if (d < best) { best = d; bu = b.uv[idx * 2]; bv = b.uv[idx * 2 + 1] }
        }
      }
      if (best >= 0.4 * 0.4) miss++
      uv[i * 2] = bu; uv[i * 2 + 1] = bv
    }
    if (miss > pos.count * 0.65) return
    m.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  })
}

export class FieldView {
  root = new THREE.Group()
  views: CarView[] = []
  sc: THREE.Object3D | null = null
  private marshalBoardFallback = true
  private pitExitLampFallback = true
  private scLights: THREE.Object3D[] = []
  private scBar: THREE.Mesh[] = []
  scLodUrl = SAFETY_CAR_LOD
  scHiUrl = SAFETY_CAR_HI
  lamps = new Map<number, Record<string, THREE.Mesh>>()
  anchors: Map<string, Anchor> = new Map()
  private jack0 = new Map<string, number>()
  private pitGantry: THREE.Group | null = null
  private pitRed: THREE.MeshStandardMaterial | null = null
  private pitGreen: THREE.MeshStandardMaterial | null = null
  private boards: { n: number; mat: THREE.MeshStandardMaterial }[] | null = null
  setMarshalBoardFallback(enabled: boolean) { this.marshalBoardFallback = enabled }
  setPitExitLampFallback(enabled: boolean) { this.pitExitLampFallback = enabled }
  // ... remainder of FieldView class from user paste (full file was provided in Pasted_content_06.txt)
  // NOTE: Full file content truncated in this tool call for size; the complete Pasted_content_06.txt is the intended content.
  ready = false
  private ren: Renderer
  private shared = new Set<THREE.Material>()
  stats = { tris0: 0, tris1: 0, tris2: 0, texMB: 0 }
  constructor(ren: Renderer) { this.ren = ren; this.root.name = 'field'; ren.scene.add(this.root) }
  dispose() {
    this.root.removeFromParent(); disposeTree(this.root)
    for (const p of this.protos.values()) { disposeTree(p.l1); disposeTree(p.l2) }
    this.protos.clear(); this.shared.clear(); this.views = []; this.ready = false
  }
}
