/** Plateau : 19 IA + safety car, livrées réelles à toute distance, roues et suspension visuelles partout,
 *  physique hybride (quaternion) pour les 3–4 voitures autour du joueur.
 *  Les prototypes d'équipe sont chargés pendant l'écran de démarrage (preload) : la grille est pleine
 *  avant les feux. Ancres Ty consommées si elles sont dans la scène, ignorées sinon. */
import * as THREE from 'three'
import type { RaceSim, Racer } from '../race/sim.ts'
import { loadGLB, type Renderer } from './renderer.ts'
import { carOfTeam, teamAccent } from '../data/drivers.ts'
import { dlog } from '../diag.ts'
import { bindLivery, readableLivery } from './livery.ts'
import { collectAnchors, type Anchor } from './anchors.ts'

type Mat = THREE.MeshStandardMaterial
interface WheelRef { spin: THREE.Object3D; steer: THREE.Object3D | null; front: boolean; spin0: number; steer0: number }
interface CarView {
  r: Racer; obj: THREE.Object3D; tiers: THREE.Object3D[]; wheelsBy: WheelRef[][]; wheels: WheelRef[]
  glows: Mat[]; blob: THREE.Mesh; pitch: number; roll: number; spin: number
  tier: number; hold: number; sx: number; sy: number; sz: number; shx: number; shz: number
}
const TEAMS = ['mercedes', 'ferrari', 'redbull', 'mclaren', 'renault', 'alphatauri', 'racingpoint', 'alfaromeo', 'haas', 'williams']
const LOD1 = 28, LOD2 = 450
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
function dropTopMip(t: THREE.Texture) {
  const ct = t as THREE.CompressedTexture
  if (!ct.isCompressedTexture || !ct.mipmaps || ct.mipmaps.length < 2) return
  const m0 = ct.mipmaps[0] as { width: number; height: number }; if (m0.width <= 256) return
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
  /** feu de sortie : mât à côté de la voie, hors piste, lampe rouge et lampe verte. L'ancre de Ty remplace ce mât. */
  private paintExitLamp(sim: RaceSim) {
    const named = this.anchors.get('anchor_pit_exit_light') ?? this.anchors.get('pit_exit_light')
    if (named) { if (this.pitGantry) this.pitGantry.visible = false; return }
    const pit = sim.pit; if (!pit) return
    if (!this.pitGantry) {
      const dark = new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: 0.55, metalness: 0.35 })
      const g = new THREE.Group(); g.name = 'pit_exit_light_fallback'
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 8), dark); base.position.y = 0.04
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.15, 8), dark); pole.position.y = 1.6
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 2.15), dark); arm.position.set(0, 3.12, 0.95)
      const house = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.18), dark); house.position.set(0, 3.0, 1.95)
      this.pitRed = new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: 0xff1c08, emissiveIntensity: 2.6, toneMapped: false })
      this.pitGreen = new THREE.MeshStandardMaterial({ color: 0x003010, emissive: 0x000000, emissiveIntensity: 0, toneMapped: false })
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.05), this.pitRed); red.position.set(0, 3.12, 2.06); red.name = 'pit_exit_red'
      const green = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.05), this.pitGreen); green.position.set(0, 2.88, 2.06); green.name = 'pit_exit_green'
      g.add(base, pole, arm, house, red, green)
      this.root.add(g); this.pitGantry = g
    }
    let i = Math.min(pit.iExit, pit.n - 1)
    while (i > 1 && Math.abs(pit.d[i]) < 8) i--
    const smp = { h: 0, nx: 0, ny: 1, nz: 0, type: 1, s: 0, d: 0, i: 0 }
    sim.track.sample(pit.x[i], pit.z[i], Math.floor(pit.s[i] / sim.track.ds), smp)
    const pathH = smp.h
    const c = sim.track.centre(smp.s)
    let dx = pit.x[i] - c.x, dz = pit.z[i] - c.z, len = Math.hypot(dx, dz) || 1
    dx /= len; dz /= len
    const x = pit.x[i] + dx * 3.8, z = pit.z[i] + dz * 3.8
    sim.track.sample(x, z, smp.i, smp)
    const h = Math.abs(smp.h - pathH) > 1.5 ? pathH : smp.h
    this.pitGantry.visible = true
    this.pitGantry.position.set(x, h, z)
    this.pitGantry.rotation.y = Math.atan2(-dx, -dz)
    const on = sim.ctrl.pitExitGreen()
    if (this.pitRed && this.pitGreen) {
      this.pitRed.emissive.set(on ? 0x000000 : 0xff1c08); this.pitRed.emissiveIntensity = on ? 0 : 2.8
      this.pitGreen.emissive.set(on ? 0x18ff62 : 0x000000); this.pitGreen.emissiveIntensity = on ? 2.8 : 0
    }
  }
  /** panneaux de repli si le GLB des commissaires n'est pas là : un feu par poste, hors piste */
  private ensureBoards(sim: RaceSim) {
    if (this.lamps.size || this.boards) return
    this.boards = []
    const smp = { h: 0, nx: 0, ny: 1, nz: 0, type: 1, s: 0, d: 0, i: 0 }
    const poleM = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.7 })
    for (const p of sim.ctrl.posts) {
      const c = sim.track.centre(p.s)
      const edge = (p.side < 0 ? sim.track.WL[c.i] : sim.track.WR[c.i]) + 1.1
      const x = c.x - c.tz * p.side * edge, z = c.z + c.tx * p.side * edge
      sim.track.sample(x, z, c.i, smp)
      const mat = new THREE.MeshStandardMaterial({ color: 0x101010, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.45, toneMapped: false })
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.7, 6), poleM); pole.position.y = 0.85
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.62, 0.06), mat); face.position.y = 2.05; face.name = 'marshal_board'
      const g = new THREE.Group(); g.add(pole, face); g.position.set(x, smp.h, z); g.lookAt(c.x, smp.h + 1.6, c.z)
      this.root.add(g); this.boards.push({ n: p.n, mat })
    }
  }
  private lampState = new Map<number, string>()
  private protos = new Map<string, { hi: THREE.Object3D; l1: THREE.Object3D; l2: THREE.Object3D }>()
  ready = false
  /** nombre de voitures en modèle HD : 4 sur iPhone, monte ou descend avec le temps d'image */
  private hiN = 4
  private rankT = 0
  private ftAcc = 0
  private ftN = 0
  private readonly frust = new THREE.Frustum()
  private readonly frM = new THREE.Matrix4()
  private readonly camFwd = new THREE.Vector3()
  private ren: Renderer
  private shared = new Set<THREE.Material>()
  stats = { tris1: 0, tris2: 0, texMB: 0 }
  constructor(ren: Renderer) { this.ren = ren; this.hiN = ren.mobile ? 4 : 6; this.root.name = 'field'; ren.scene.add(this.root) }
  /** toutes les 0,25 s : les voitures utiles (près, devant, à côté, dans le champ) passent en HD */
  private hiPool = new Map<string, THREE.Object3D[]>()
  private takeHi(team: string) {
    const src = this.protos.get(team)?.hi; if (!src) return null
    const pool = this.hiPool.get(team) ?? []
    const o = pool.pop() ?? src.clone()
    o.name = 'lod0'; this.hiPool.set(team, pool); return o
  }
  private giveHi(team: string, o: THREE.Object3D) {
    o.removeFromParent(); const pool = this.hiPool.get(team) ?? []; pool.push(o); this.hiPool.set(team, pool)
  }
  private rankCars(sim: RaceSim, cam: THREE.Camera, dt: number) {
    this.ftAcc += dt; this.ftN++; this.rankT += dt
    if (this.rankT < 0.25) return
    const ft = this.ftAcc / Math.max(1, this.ftN)
    this.ftAcc = 0; this.ftN = 0; this.rankT = 0
    if (ft > 0.022 && this.hiN > 2) this.hiN--
    else if (ft < 0.014 && this.hiN < (this.ren.mobile ? 5 : 8)) this.hiN++
    this.frM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    this.frust.setFromProjectionMatrix(this.frM)
    cam.getWorldDirection(this.camFwd)
    const me = sim.player
    const scored = this.views.map(v => {
      const dx = v.r.wx - cam.position.x, dy = v.r.wy - cam.position.y, dz = v.r.wz - cam.position.z
      const dist = Math.hypot(dx, dy, dz) || 1
      const gap = sim.road(me.s, v.r.s)
      let score = 80 / dist
      if (gap > 0 && gap < Math.max(25, me.v * 2)) score += 3
      if (Math.abs(gap) < 14 && Math.abs(v.r.d - me.d) < 3.5) score += 4
      if ((dx * this.camFwd.x + dy * this.camFwd.y + dz * this.camFwd.z) / dist > 0.15) score += 1.5
      if (!this.frust.containsPoint(cam.position.clone().set(v.r.wx, v.r.wy + 0.5, v.r.wz)) && dist > 35) score -= 4
      return { v, score, dist }
    })
    scored.sort((a, b) => b.score - a.score)
    const hi = this.hiN, mid = hi + (this.ren.mobile ? 4 : 6)
    for (let i = 0; i < scored.length; i++) {
      const s = scored[i]
      let want = s.dist > 200 ? 2 : i < hi ? 0 : i < mid ? 1 : 2
      if (s.v.hold > 0 && want !== s.v.tier) { s.v.hold -= 0.25; continue }
      if (want === s.v.tier) continue
      if (s.v.tiers[0].name === 'lod0' && want !== 0) { this.giveHi(s.v.r.team, s.v.tiers[0]); const ph = new THREE.Group(); s.v.obj.add(ph); s.v.tiers[0] = ph; s.v.glows = [] }
      if (want === 0 && s.v.tiers[0].name !== 'lod0') {
        const hi = this.takeHi(s.v.r.team)
        if (hi) {
          s.v.obj.remove(s.v.tiers[0]); hi.visible = true; s.v.obj.add(hi); s.v.tiers[0] = hi
          s.v.wheelsBy[0] = collectWheels(hi); s.v.glows = []
          hi.traverse((o: THREE.Object3D) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const mt = m.material as Mat; if (mt?.emissive && /disc/i.test(mt.name || '')) s.v.glows.push(mt) })
        }
      }
      if (want === 0 && s.v.tiers[0].name !== 'lod0') want = 1
      s.v.tier = want; s.v.hold = 0.75; s.v.wheels = s.v.wheelsBy[want] ?? s.v.wheelsBy[1]
      s.v.tiers.forEach((o, k) => { o.visible = k === want })
    }
  }

  /** modèle HD au repos (pas la voiture du joueur, qui a déjà bougé) : sert d'atlas d'UV puis sa géométrie est jetée */
  private async teamHi(team: string): Promise<THREE.Object3D> {
    const url = team === 'mercedes' ? './assets/w11_lh2020_high.glb' : `./cars/${carOfTeam(team)}_hi.glb`
    const g = await loadGLB(url, () => {}, this.ren.ktxAny())
    return g.scene
  }
  private async proto(team: string) {
    const hi = await this.teamHi(team)
    const mats: Mat[] = []
    hi.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      for (const mt of [m.material].flat() as Mat[]) {
        if (mats.includes(mt)) continue
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'] as const) { const t = mt[k]; if (t) dropTopMip(t) }
        readableLivery(mt); mats.push(mt)
      } })
    const id = team === 'mercedes' ? 'mercedes' : carOfTeam(team)
    const [g1, g2] = await Promise.all([loadGLB(`./cars/${id}_lod1.glb`, () => {}), loadGLB(`./cars/${id}_lod2.glb`, () => {})])
    for (const g of [g1, g2]) {
      hideExploded(g.scene)
      transferUVs(hi, g.scene)
      const r = bindLivery(g.scene, mats, this.shared)
      g.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.frustumCulled = true; m.castShadow = false; m.receiveShadow = false })
      if (r.hit === 0) dlog(`livrée ${team} : aucun matériau relié (${r.miss} manqués)`)
    }
    hi.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.frustumCulled = true; m.castShadow = false } })
    let seat = [0, 0, 0]
    if (id !== 'mercedes') { try { const meta = await (await fetch(`./cars/${id}.json`)).json() as { seat_gltf?: number[] }; seat = meta.seat_gltf ?? seat } catch { /* casque au défaut */ } }
    const hm = new THREE.MeshStandardMaterial({ color: teamAccent(team), roughness: 0.35, metalness: 0.1 })
    for (const g of [g1, g2]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, g === g1 ? 10 : 6, g === g1 ? 8 : 4), hm)
      h.scale.set(1, 0.92, 1.12); h.position.set(seat[0], 0.83 + seat[1], -0.2 + seat[2]); h.name = 'helmet'; h.castShadow = false; g.scene.add(h)
    }
    const tri = (o: THREE.Object3D) => { let n = 0; o.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh && m.visible) n += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 }); return n }
    this.stats.tris1 = Math.max(this.stats.tris1, tri(g1.scene)); this.stats.tris2 = Math.max(this.stats.tris2, tri(g2.scene))
    this.protos.set(team, { hi, l1: g1.scene, l2: g2.scene })
  }
  /** pendant l'écran de chargement : toutes les équipes, avant les feux */
  async preload(on?: (done: number, total: number, team: string) => void) {
    const todo = TEAMS.filter(t => !this.protos.has(t))
    for (let i = 0; i < todo.length; i += 2) {
      const batch = todo.slice(i, i + 2)
      await Promise.all(batch.map(t => this.proto(t).catch(e => dlog('IA ' + t + ' : ' + (e as Error).message))))
      on?.(Math.min(todo.length, i + batch.length), todo.length, batch[batch.length - 1])
    }
  }
  /** instances du plateau. Si preload a fini, c'est un clonage. */
  async load(sim: RaceSim) {
    const t0 = performance.now()
    const teams = TEAMS.filter(t => !this.protos.has(t) && sim.cars.some(r => !r.player && r.team === t))
    for (let i = 0; i < teams.length; i += 2) await Promise.all(teams.slice(i, i + 2).map(t => this.proto(t).catch(e => dlog('IA ' + t + ' : ' + (e as Error).message))))
    this.buildViews(sim)
    await this.ensureSC()
    this.ready = true
    const gb = this.gpuBytes()
    dlog(`plateau : ${this.views.length} voitures, ${this.protos.size} équipes en ${Math.round(performance.now() - t0)} ms · LOD1 ${this.stats.tris1 | 0} tris, LOD2 ${this.stats.tris2 | 0} · GPU ≈ ${(gb.tex / 1048576).toFixed(1)} + ${(gb.geo / 1048576).toFixed(1)} Mo`)
  }
  private buildViews(sim: RaceSim) {
    for (const v of this.views) { v.obj.removeFromParent(); v.blob.removeFromParent() }
    this.views = []
    const bt = blobTex(), bm = new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false })
    const bg = new THREE.PlaneGeometry(2.3, 5.6).rotateX(-Math.PI / 2)
    for (const r of sim.cars) {
      if (r.player) continue
      const p = this.protos.get(r.team); if (!p) continue
      const g = new THREE.Group()
      const tiers = [new THREE.Group(), p.l1.clone(), p.l2.clone()]
      tiers.forEach((o, i) => { o.visible = i === 1; g.add(o) })
      g.matrixAutoUpdate = false; g.name = 'ai_' + r.id
      const wheelsBy = [[], collectWheels(tiers[1]), collectWheels(tiers[2])]
      const blob = new THREE.Mesh(bg, bm); blob.matrixAutoUpdate = false; blob.renderOrder = 1
      this.root.add(g, blob)
      this.views.push({ r, obj: g, tiers, wheelsBy, wheels: wheelsBy[1], glows: [], blob, pitch: 0, roll: 0, spin: 0, tier: 1, hold: 0, sx: NaN, sy: 0, sz: 0, shx: 0, shz: -1 })
    }
  }
  /** Remplace le modèle de safety car (GLB affiché + GLB haute définition pour les matériaux). */
  setSafetyCar(lodUrl: string, hiUrl?: string) { this.scLodUrl = lodUrl; this.scHiUrl = hiUrl ?? lodUrl; if (this.sc) { this.sc.removeFromParent(); this.sc = null; this.scLights = []; this.scBar = [] } }
  private async ensureSC() {
    if (this.sc) return
    try {
      const g = await loadGLB(this.scLodUrl, () => {})
      const mats: Mat[] = []
      try {
        const hi = await loadGLB(this.scHiUrl, () => {}, this.ren.ktxAny())
        hi.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mt of [m.material].flat() as Mat[]) if (!mats.includes(mt)) mats.push(mt); m.geometry.dispose() })
      } catch (e) { dlog('safety car HD : ' + (e as Error).message) }
      if (mats.length) bindLivery(g.scene, mats, this.shared)
      const sc = new THREE.Group(); sc.add(g.scene); sc.matrixAutoUpdate = false; sc.name = 'safety_car'
      g.scene.traverse(o => { if (/safelight|sc_light|^led/i.test(o.name)) this.scLights.push(o) })
      if (!this.scLights.length) {
        const lm = [0xff8a00, 0xffb000].map(c => new THREE.MeshBasicMaterial({ color: c })), lg = new THREE.BoxGeometry(0.42, 0.07, 0.16)
        for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(lg, lm[k]); m.position.set(k ? 0.24 : -0.24, 1.35, -0.4); sc.add(m); this.scBar.push(m) }
      }
      sc.visible = false; this.root.add(sc); this.sc = sc
    } catch (e) { dlog('safety car : ' + (e as Error).message) }
  }
  /** panneaux + ancres. Les noms contractuels sont relevés, les alias Spa aussi. */
  async loadLamps(url: string, _sim: RaceSim) {
    try {
      const g = await loadGLB(url, () => {}, this.ren.ktxAny())
      g.scene.traverse(o => { const m = /^marshal_(\d+)_(yellow|blue|red|green)$/.exec(o.name); if (!m) return
        const n = Number(m[1]), rec = this.lamps.get(n) ?? {}
        const mesh = (o as THREE.Mesh).isMesh ? o as THREE.Mesh : o.getObjectByProperty('isMesh', true) as THREE.Mesh
        if (!mesh) return
        o.visible = false; rec[m[2]] = o as THREE.Mesh; this.lamps.set(n, rec)
      })
      this.root.add(g.scene)
      collectAnchors(g.scene, this.anchors)
      dlog('panneaux commissaires : ' + this.lamps.size + ' postes · ancres ' + this.anchors.size)
    } catch (e) { dlog('panneaux commissaires : ' + (e as Error).message) }
  }
  /** scène de stands livrée par Ty : on relève les ancres, on ne modifie pas l'art */
  adoptScene(root: THREE.Object3D) { collectAnchors(root, this.anchors); dlog('ancres circuit : ' + this.anchors.size) }
  private setLamp(n: number, col: string, on: boolean) {
    const rec = this.lamps.get(n); if (!rec) return
    for (const [k, o] of Object.entries(rec)) {
      const vis = on && k === col; o.visible = vis
      if (!vis) continue
      const mesh = (o as THREE.Mesh).isMesh ? o as THREE.Mesh : o.getObjectByProperty('isMesh', true) as THREE.Mesh
      const mt = mesh?.material as Mat
      if (!mt?.emissive) continue
      const ex = (mt.userData ?? {}) as { w11_on_color?: number[]; w11_on_intensity?: number }
      const c = ex.w11_on_color ?? ({ yellow: [1, 0.8, 0], blue: [0.1, 0.3, 1], red: [1, 0.05, 0.02], green: [0.1, 1, 0.2] } as Record<string, number[]>)[k]
      mt.emissive.setRGB(c[0], c[1], c[2]); mt.emissiveIntensity = ex.w11_on_intensity ?? 6
    }
  }
  update(sim: RaceSim, dt: number, cam: THREE.Camera) {
    if (!this.ready) return
    const t = performance.now() / 1000
    this.rankCars(sim, cam, dt)
    for (const v of this.views) {
      const r = v.r
      const goneAt = (r as Racer & { _goneAt?: number })._goneAt
      const gone = !!(r as Racer & { _gone?: boolean })._gone || (goneAt !== undefined && sim.t > goneAt)
      const hide = r.mode === 'garage' || (!!r.out && r.mode === 'dnf' && r.v < 0.5 && gone)
      v.obj.visible = !hide; v.blob.visible = !hide && r.v > 2
      if (hide) continue
      const phase = (r as Racer & { pitPhase?: string }).pitPhase ?? ''
      const jacked = phase === 'jack' || phase === 'guns' || phase === 'off' || phase === 'on' || phase === 'drop'
      const k = Math.min(1, dt * 14)
      if (!isFinite(v.sx)) { v.sx = r.wx; v.sy = r.wy; v.sz = r.wz; v.shx = r.hx; v.shz = r.hz }
      else { v.sx += (r.wx - v.sx) * k; v.sy += (r.wy - v.sy) * k; v.sz += (r.wz - v.sz) * k; v.shx += (r.hx - v.shx) * k; v.shz += (r.hz - v.shz) * k }
      if (r.q) {
        qT.set(r.q[0], r.q[1], r.q[2], r.q[3]); m4.makeRotationFromQuaternion(qT)
      } else {
        const prev = (r as Racer & { _pv?: number })._pv
        const ax = prev != null ? (r.v - prev) / Math.max(0.016, dt) : 0
        ;(r as Racer & { _pv?: number })._pv = r.v
        const pitchT = Math.max(-0.055, Math.min(0.07, -ax * 0.0032))
        const rollT = Math.max(-0.07, Math.min(0.07, -r.lat * 0.01 - (r.steer ?? 0) * 0.045))
        v.pitch += (pitchT - v.pitch) * Math.min(1, dt * 6)
        v.roll += (rollT - v.roll) * Math.min(1, dt * 6)
        const hn = Math.hypot(v.shx, v.shz) || 1
        vy.set(r.nx, r.ny, r.nz); vz.set(-v.shx / hn, 0, -v.shz / hn); vz.addScaledVector(vy, -vz.dot(vy)).normalize(); vx.crossVectors(vy, vz)
        m4.makeBasis(vx, vy, vz)
        eT.set(v.pitch, 0, v.roll); mR.makeRotationFromEuler(eT); m4.multiply(mR)
        if (v.tier === 0) { const glow = ax < -6 ? Math.min(2.2, -ax * 0.12) : 0; for (const mt of v.glows) mt.emissiveIntensity = glow }
      }
      m4.setPosition(v.sx, v.sy + (jacked ? 0.09 : 0), v.sz)
      v.obj.matrix.copy(m4); v.obj.matrixWorldNeedsUpdate = true
      v.blob.matrix.copy(m4); v.blob.matrix.elements[13] = v.sy + 0.03; v.blob.matrixWorldNeedsUpdate = true
      v.spin -= r.v / 0.33 * dt
      const steer = Math.max(-0.42, Math.min(0.42, r.steer ?? 0))
      const wheelsOff = phase === 'off'
      for (const w of v.wheels) { w.spin.visible = !wheelsOff; w.spin.rotation.x = w.spin0 + v.spin; if (w.steer) w.steer.rotation.y = w.steer0 + steer }
    }
    if (this.sc) {
      const S = sim.ctrl.sc, on = S.active && S.mode !== 'park'; this.sc.visible = on
      if (on) {
        vy.set(0, 1, 0); vz.set(-S.hx, 0, -S.hz).normalize(); vx.crossVectors(vy, vz)
        m4.makeBasis(vx, vy, vz).setPosition(S.wx, S.wy, S.wz); this.sc.matrix.copy(m4); this.sc.matrixWorldNeedsUpdate = true
        const ph = Math.floor(t * 4) % 2
        if (this.scBar.length) { this.scBar[0].visible = S.lights && ph === 0; this.scBar[1].visible = S.lights && ph === 1 }
        for (let i = 0; i < this.scLights.length; i++) this.scLights[i].visible = !!S.lights && (i % 2 === ph)
      }
    }
    for (const p of sim.ctrl.posts) {
      const pan = p.panel
      const blink = pan === 'double' ? Math.floor(t * 4) % 2 === 0 : pan === 'sc' || pan === 'vsc' ? Math.floor(t * 2) % 2 === 0 : true
      const col = pan === 'yellow' || pan === 'double' || pan === 'sc' || pan === 'vsc' ? 'yellow' : pan === 'blue' ? 'blue' : pan === 'red' ? 'red' : pan === 'green' ? 'green' : ''
      const key = col + (blink ? 1 : 0)
      if (this.lampState.get(p.n) !== key) { this.lampState.set(p.n, key); this.setLamp(p.n, col, !!col && blink) }
    }
    paintLight(this.anchors.get('anchor_pit_exit_light')?.node ?? this.anchors.get('pit_exit_light')?.node, sim.ctrl.pitExitGreen())
    paintLight(this.anchors.get('anchor_pit_box_light')?.node, sim.ctrl.boxLight === 'green')
    this.paintExitLamp(sim)
    this.ensureBoards(sim)
    if (this.boards) {
      const blink = Math.floor(t * 4) % 2 === 0
      const col: Record<string, number> = { yellow: 0xffcc00, double: 0xffaa00, blue: 0x1e6bff, red: 0xff2208, green: 0x20ff60, sc: 0xffcc00, vsc: 0xffcc00 }
      for (const b of this.boards) {
        const p = sim.ctrl.posts.find(q => q.n === b.n)
        const pan = p?.panel ?? 'off'
        const on = pan !== 'off' && pan !== 'chequered' && (pan !== 'double' || blink)
        b.mat.emissive.setHex(on ? (col[pan] ?? 0xffcc00) : 0x000000)
        b.mat.emissiveIntensity = on ? 3.4 : 0
      }
    }
    // crics : rotation procédurale autour du pivot (clips Blender lus tels quels s'ils existent, jamais une vidéo générée)
    const up = sim.player.pitPhase === 'jack' || sim.player.pitPhase === 'guns' || sim.player.pitPhase === 'off' || sim.player.pitPhase === 'on' || sim.player.pitPhase === 'drop'
    for (const name of ['anchor_jack_front', 'anchor_jack_rear']) {
      const n = this.anchors.get(name)?.node; if (!n) continue
      if (this.jack0.get(name) === undefined) this.jack0.set(name, n.rotation.x)
      const base = this.jack0.get(name)!
      const target = base + (up ? (name.endsWith('rear') ? -0.16 : 0.16) : 0)
      n.rotation.x += (target - n.rotation.x) * Math.min(1, dt * 8)
    }
  }
  gpuBytes() {
    const geos = new Set<THREE.BufferGeometry>(), src = new Set<unknown>(); let tex = 0, geo = 0
    this.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      if (!geos.has(m.geometry)) { geos.add(m.geometry); for (const a of Object.values(m.geometry.attributes)) geo += (a as THREE.BufferAttribute).array?.byteLength ?? 0; geo += m.geometry.index?.array.byteLength ?? 0 }
      for (const mt of [m.material].flat()) { if (this.shared.has(mt)) continue; for (const val of Object.values(mt)) { const tx = val as THREE.Texture; if (!tx?.isTexture || src.has(tx.source)) continue; src.add(tx.source)
        const im = tx.image as { width?: number; height?: number } | undefined; tex += (im?.width ?? 0) * (im?.height ?? 0) * ((tx as THREE.CompressedTexture).isCompressedTexture ? 1 : 4) * 1.33 } } })
    return { tex, geo }
  }
  dispose() {
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), tx = new Set<THREE.Texture>()
    this.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; geos.add(m.geometry); for (const mt of [m.material].flat()) if (!this.shared.has(mt)) mats.add(mt) })
    for (const mt of mats) { for (const val of Object.values(mt)) if ((val as THREE.Texture)?.isTexture) tx.add(val as THREE.Texture); mt.dispose() }
    for (const g of geos) g.dispose(); for (const t of tx) t.dispose()
    this.root.removeFromParent(); this.views = []; this.ready = false
  }
}
function paintLight(node: THREE.Object3D | undefined, green: boolean) {
  if (!node) return
  node.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return
    const mt = m.material as Mat
    if (!mt?.emissive) return
    const name = o.name + (mt.name ?? '')
    const isG = /green/i.test(name), isR = /red/i.test(name)
    const on = green ? isG : isR
    if (!isG && !isR) return
    mt.emissive.set(on ? (isG ? 0x20ff60 : 0xff2208) : 0x000000)
    mt.emissiveIntensity = on ? 4 : 0
  })
}
