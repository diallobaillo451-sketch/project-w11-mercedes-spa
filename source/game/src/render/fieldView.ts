/** Lot 8 C — rendu du plateau IA (19 voitures + safety car) et des panneaux lumineux des commissaires.
 *  Budget iPhone : chaque voiture IA = THREE.LOD (LOD1 ≈ 20 k tris < 28 m, LOD2 ≈ 6 k tris < 450 m, rien au-delà).
 *  Les LOD n'ont pas de textures : on charge une fois la version haute de chaque équipe, on lui prend ses textures
 *  en retirant le niveau de mip le plus grand (÷4 en mémoire GPU : une voiture IA n'est jamais vue en plein écran),
 *  puis on jette sa géométrie (jamais envoyée au GPU). Mercedes : textures de la W11 du joueur, partagées telles quelles. */
import * as THREE from 'three'
import type { RaceSim, Racer } from '../race/sim.ts'
import { loadGLB, disposeTree, type Renderer } from './renderer.ts'
import { carOfTeam, teamAccent } from '../data/drivers.ts'
import { dlog } from '../diag.ts'

type Mat = THREE.MeshStandardMaterial
interface CarView { r: Racer; obj: THREE.LOD; wheels: { spin: THREE.Object3D; steer: THREE.Object3D | null; front: boolean }[]; blob: THREE.Mesh }
const TEAMS = ['mercedes', 'ferrari', 'redbull', 'mclaren', 'renault', 'alphatauri', 'racingpoint', 'alfaromeo', 'haas', 'williams']
const LOD1 = 28, LOD2 = 450
const m4 = new THREE.Matrix4(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3()

function blobTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
/** retire le plus grand niveau de mip d'une texture compressée (avant tout envoi au GPU) */
function dropTopMip(t: THREE.Texture) {
  const ct = t as THREE.CompressedTexture
  if (!ct.isCompressedTexture || !ct.mipmaps || ct.mipmaps.length < 2) return
  const m0 = ct.mipmaps[0] as { width: number; height: number }; if (m0.width <= 256) return
  ct.mipmaps = ct.mipmaps.slice(1); const m1 = ct.mipmaps[0] as { width: number; height: number }
  ;(ct.image as { width: number; height: number }) = { width: m1.width, height: m1.height } as never; ct.needsUpdate = true
}
export class FieldView {
  root = new THREE.Group()
  views: CarView[] = []
  sc: THREE.Object3D | null = null; private scBar: THREE.Mesh[] = []
  lamps = new Map<number, Record<string, THREE.Mesh>>()
  private lampState = new Map<number, string>()
  private protos = new Map<string, { l1: THREE.Object3D; l2: THREE.Object3D }>()
  ready = false
  private ang = new Map<Racer, number>()
  /** matériaux empruntés à la voiture du joueur : jamais libérés ici */
  private shared = new Set<THREE.Material>()
  stats = { tris1: 0, tris2: 0, texMB: 0 }
  private ren: Renderer
  constructor(ren: Renderer) { this.ren = ren; this.root.name = 'field'; ren.scene.add(this.root) }
  /** matériaux haute définition d'une équipe, indexés par nom */
  private async teamMats(team: string): Promise<Map<string, Mat>> {
    const map = new Map<string, Mat>()
    if (team === 'mercedes' && this.ren.rig) {
      // textures de la W11 (version haute du joueur si c'est la W11, sinon rechargée)
      const src = this.ren.carId === 'w11' ? this.ren.rig.root : null
      if (src) { src.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) for (const mt of [m.material].flat() as Mat[]) if (!map.has(mt.name)) { map.set(mt.name, mt); this.shared.add(mt) } }); return map }
    }
    const url = team === 'mercedes' ? './assets/w11_lh2020_high.glb' : `./cars/${carOfTeam(team)}_hi.glb`
    const g = await loadGLB(url, () => {}, this.ren.ktxAny())
    g.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      for (const mt of [m.material].flat() as Mat[]) { if (map.has(mt.name)) continue; map.set(mt.name, mt)
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'] as const) { const t = mt[k]; if (t) dropTopMip(t) } }
      m.geometry.dispose() })
    return map
  }
  private async proto(team: string) {
    const mats = await this.teamMats(team)
    const id = team === 'mercedes' ? 'mercedes' : carOfTeam(team)
    const [g1, g2] = await Promise.all([loadGLB(`./cars/${id}_lod1.glb`, () => {}), loadGLB(`./cars/${id}_lod2.glb`, () => {})])
    for (const g of [g1, g2]) g.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      const mt = m.material as Mat, hi = mats.get(mt.name); if (hi) { mt.dispose(); m.material = hi } else { mt.envMapIntensity = 1 }
      m.frustumCulled = true })
    // casque simple aux couleurs de l'équipe (les LOD n'ont pas de pilote)
    const meta = id === 'mercedes' ? { seat_gltf: [0, 0, 0] } : await (await fetch(`./cars/${id}.json`)).json() as { seat_gltf: number[] }
    const hm = new THREE.MeshStandardMaterial({ color: teamAccent(team), roughness: 0.35, metalness: 0.1 })
    for (const g of [g1, g2]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, g === g1 ? 12 : 6, g === g1 ? 8 : 4), hm)
      h.scale.set(1, 0.92, 1.12); h.position.set(meta.seat_gltf[0], 0.83 + meta.seat_gltf[1], -0.2 + meta.seat_gltf[2]); h.name = 'helmet'; g.scene.add(h) }
    const tri = (o: THREE.Object3D) => { let n = 0; o.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) n += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 }); return n }
    this.stats.tris1 = Math.max(this.stats.tris1, tri(g1.scene)); this.stats.tris2 = Math.max(this.stats.tris2, tri(g2.scene))
    this.protos.set(team, { l1: g1.scene, l2: g2.scene })
  }
  async load(sim: RaceSim) {
    const t0 = performance.now(), teams = TEAMS.filter(t => !this.protos.has(t) && sim.cars.some(r => !r.player && r.team === t))
    for (const v of this.views) { v.obj.removeFromParent(); v.blob.removeFromParent() } this.views = []; this.ang.clear()
    // 2 équipes à la fois (pic mémoire de décodage limité)
    for (let i = 0; i < teams.length; i += 2) await Promise.all(teams.slice(i, i + 2).map(t => this.proto(t).catch(e => dlog('IA ' + t + ' : ' + (e as Error).message))))
    const bt = blobTex(), bm = new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), bg = new THREE.PlaneGeometry(2.3, 5.6).rotateX(-Math.PI / 2)
    for (const r of sim.cars) {
      if (r.player) continue
      const p = this.protos.get(r.team); if (!p) continue
      const lod = new THREE.LOD(), a = p.l1.clone(), b = p.l2.clone()
      lod.addLevel(a, 0); lod.addLevel(b, LOD1); lod.addLevel(new THREE.Object3D(), LOD2); lod.matrixAutoUpdate = false; lod.name = 'ai_' + r.id
      const wheels: CarView['wheels'] = []
      for (const w of ['FL', 'FR', 'RL', 'RR']) { const st = a.getObjectByName('W_' + w + '.L1') ?? a.getObjectByName('W_' + w), sp = a.getObjectByName('W_' + w + '_spin.L1') ?? a.getObjectByName('W_' + w + '_spin')
        if (sp) wheels.push({ spin: sp, steer: w[0] === 'F' ? st ?? null : null, front: w[0] === 'F' }) }
      const blob = new THREE.Mesh(bg, bm); blob.matrixAutoUpdate = false; blob.renderOrder = 1
      this.root.add(lod, blob); this.views.push({ r, obj: lod, wheels, blob })
    }
    // safety car
    if (!this.sc) try { const g = await loadGLB('./cars/safetycar_lod1.glb', () => {}); const sc = new THREE.Group(); sc.add(g.scene); sc.matrixAutoUpdate = false
      const lm = [0xff8a00, 0xffb000].map(c => new THREE.MeshBasicMaterial({ color: c })), lg = new THREE.BoxGeometry(0.42, 0.07, 0.16)
      for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(lg, lm[k]); m.position.set(k ? 0.24 : -0.24, 1.3, 0.25); sc.add(m); this.scBar.push(m) }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: 0x222222 })); bar.position.set(0, 1.26, 0.25); sc.add(bar)
      sc.visible = false; this.root.add(sc); this.sc = sc } catch (e) { dlog('safety car : ' + (e as Error).message) }
    this.ready = true
    const gb = this.gpuBytes(); dlog(`plateau IA : ${this.views.length} voitures, ${this.protos.size} équipes en ${Math.round(performance.now() - t0)} ms · LOD1 ${this.stats.tris1 | 0} tris, LOD2 ${this.stats.tris2 | 0} tris · GPU propre ≈ ${(gb.tex / 1048576).toFixed(1)} Mo tex + ${(gb.geo / 1048576).toFixed(1)} Mo géo`)
  }
  /** panneaux lumineux des commissaires (marshal_lamps.glb de New Bot, 16 postes) ; sinon panneaux provisoires */
  async loadLamps(url: string, sim: RaceSim) {
    try {
      const g = await loadGLB(url, () => {}, this.ren.ktxAny())
      g.scene.traverse(o => { const m = /^marshal_(\d+)_(yellow|blue|red|green)$/.exec(o.name); if (!m) return
        const n = Number(m[1]), rec = this.lamps.get(n) ?? {}; const mesh = (o as THREE.Mesh).isMesh ? o as THREE.Mesh : o.getObjectByProperty('isMesh', true) as THREE.Mesh
        if (!mesh) return; o.visible = false; rec[m[2]] = o as THREE.Mesh; (o as THREE.Mesh).userData.mesh = mesh; this.lamps.set(n, rec) })
      this.root.add(g.scene); dlog('panneaux commissaires : ' + this.lamps.size + ' postes')
    } catch (e) { dlog('panneaux commissaires : ' + (e as Error).message) }
    void sim
  }
  private setLamp(n: number, col: string, on: boolean) {
    const rec = this.lamps.get(n); if (!rec) return
    for (const [k, o] of Object.entries(rec)) {
      const vis = on && k === col; o.visible = vis
      if (vis) { const mesh = o.userData.mesh as THREE.Mesh, mt = mesh.material as Mat, ex = (mt.userData ?? {}) as { w11_on_color?: number[]; w11_on_intensity?: number }
        const c = ex.w11_on_color ?? ({ yellow: [1, 0.8, 0], blue: [0.1, 0.3, 1], red: [1, 0.05, 0.02], green: [0.1, 1, 0.2] } as Record<string, number[]>)[k]
        mt.emissive.setRGB(c[0], c[1], c[2]); mt.emissiveIntensity = ex.w11_on_intensity ?? 6 }
    }
  }
  update(sim: RaceSim, dt: number, cam: THREE.Camera) {
    if (!this.ready) return
    const t = performance.now() / 1000
    for (const v of this.views) {
      const r = v.r, hide = r.mode === 'garage' || (r.out && r.mode === 'dnf' && r.v < 0.1 && (r as Racer & { _gone?: boolean })._gone)
      v.obj.visible = !hide; v.blob.visible = !hide
      if (hide) continue
      vy.set(r.nx, r.ny, r.nz); vz.set(-r.hx, 0, -r.hz); vz.addScaledVector(vy, -vz.dot(vy)).normalize(); vx.crossVectors(vy, vz)
      m4.makeBasis(vx, vy, vz).setPosition(r.wx, r.wy, r.wz); v.obj.matrix.copy(m4); v.obj.matrixWorldNeedsUpdate = true
      v.blob.matrix.copy(m4); v.blob.matrix.elements[13] += 0.03; v.blob.matrixWorldNeedsUpdate = true
      v.obj.update(cam)
      if (v.obj.getCurrentLevel() === 0) { const a = (this.ang.get(r) ?? 0) - r.v / 0.33 * dt; this.ang.set(r, a)
        const steer = Math.max(-0.35, Math.min(0.35, r.steer ?? 0))
        for (const w of v.wheels) { w.spin.rotation.x = a; if (w.steer) w.steer.rotation.y = steer } }
    }
    if (this.sc) { const S = sim.ctrl.sc, on = S.active && S.mode !== 'park'; this.sc.visible = on
      if (on) { vy.set(0, 1, 0); vz.set(-S.hx, 0, -S.hz).normalize(); vx.crossVectors(vy, vz); m4.makeBasis(vx, vy, vz).setPosition(S.wx, S.wy, S.wz); this.sc.matrix.copy(m4); this.sc.matrixWorldNeedsUpdate = true
        const ph = Math.floor(t * 4) % 2; this.scBar[0].visible = S.lights && ph === 0; this.scBar[1].visible = S.lights && ph === 1 } }
    // panneaux : couleur par poste (SC / VSC : jaune clignotant, double jaune : jaune clignotant rapide)
    for (const p of sim.ctrl.posts) {
      const pan = p.panel, blink = pan === 'double' ? Math.floor(t * 4) % 2 === 0 : pan === 'sc' || pan === 'vsc' ? Math.floor(t * 2) % 2 === 0 : true
      const col = pan === 'yellow' || pan === 'double' || pan === 'sc' || pan === 'vsc' ? 'yellow' : pan === 'blue' ? 'blue' : pan === 'red' ? 'red' : pan === 'green' ? 'green' : ''
      const key = col + (blink ? 1 : 0)
      if (this.lampState.get(p.n) !== key) { this.lampState.set(p.n, key); this.setLamp(p.n, col, !!col && blink) }
    }
  }
  /** mémoire GPU propre au plateau (textures non partagées + géométries), en octets (E : ASTC/ETC2 ≈ 1 o/px, mips +33 %) */
  gpuBytes() {
    const geos = new Set<THREE.BufferGeometry>(), src = new Set<unknown>(); let tex = 0, geo = 0
    this.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      if (!geos.has(m.geometry)) { geos.add(m.geometry); for (const a of Object.values(m.geometry.attributes)) geo += (a as THREE.BufferAttribute).array?.byteLength ?? 0; geo += m.geometry.index?.array.byteLength ?? 0 }
      for (const mt of [m.material].flat()) { if (this.shared.has(mt)) continue; for (const v of Object.values(mt)) { const t = v as THREE.Texture; if (!t?.isTexture || src.has(t.source)) continue; src.add(t.source)
        const im = t.image as { width?: number; height?: number } | undefined; tex += (im?.width ?? 0) * (im?.height ?? 0) * ((t as THREE.CompressedTexture).isCompressedTexture ? 1 : 4) * 1.33 } } })
    return { tex, geo }
  }
  dispose() {
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), tx = new Set<THREE.Texture>()
    this.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; geos.add(m.geometry); for (const mt of [m.material].flat()) if (!this.shared.has(mt)) mats.add(mt) })
    for (const mt of mats) { for (const v of Object.values(mt)) if ((v as THREE.Texture)?.isTexture) tx.add(v as THREE.Texture); mt.dispose() }
    for (const g of geos) g.dispose(); for (const t of tx) t.dispose()
    this.root.removeFromParent(); this.views = []; this.ready = false; void disposeTree }
}
