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
interface WheelRef { spin: THREE.Object3D; steer: THREE.Object3D | null; front: boolean }
interface CarView { r: Racer; obj: THREE.LOD; wheels: WheelRef[]; blob: THREE.Mesh; pitch: number; roll: number; spin: number }
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
    if (sp) wheels.push({ spin: sp, steer: w[0] === 'F' ? st ?? null : null, front: w[0] === 'F' })
  }
  return wheels
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
  private pitLamp: THREE.Mesh | null = null
  /** feu de sortie si Ty n'a pas posé `pit_exit_light` : rouge tant que la sortie est fermée (drapeau rouge compris) */
  private paintExitLamp(sim: RaceSim) {
    const named = this.anchors.get('anchor_pit_exit_light') ?? this.anchors.get('pit_exit_light')
    if (named) { if (this.pitLamp) this.pitLamp.visible = false; return }
    const pit = sim.pit; if (!pit) return
    if (!this.pitLamp) {
      const m = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xff2208, emissiveIntensity: 3.2, toneMapped: false })
      this.pitLamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.1), m)
      this.pitLamp.name = 'pit_exit_light_fallback'
      this.root.add(this.pitLamp)
    }
    const L = pit.light
    this.pitLamp.visible = true
    this.pitLamp.position.set(L.x, 1.55, L.z)
    const mt = this.pitLamp.material as THREE.MeshStandardMaterial
    const green = sim.ctrl.pitExitGreen()
    mt.emissive.set(green ? 0x20ff60 : 0xff2208)
  }
  private lampState = new Map<number, string>()
  private protos = new Map<string, { l1: THREE.Object3D; l2: THREE.Object3D }>()
  ready = false
  private ren: Renderer
  private shared = new Set<THREE.Material>()
  stats = { tris1: 0, tris2: 0, texMB: 0 }
  constructor(ren: Renderer) { this.ren = ren; this.root.name = 'field'; ren.scene.add(this.root) }

  /** matériaux HD d'une équipe (géométrie jetée, mip haut retiré). Mercedes = W11, jamais la livrée d'une autre équipe. */
  private async teamMats(team: string): Promise<Mat[]> {
    if (team === 'mercedes' && this.ren.rig && this.ren.carId === 'w11') {
      const out: Mat[] = []
      this.ren.rig.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
        for (const mt of [m.material].flat() as Mat[]) { if (out.includes(mt)) continue; readableLivery(mt); out.push(mt); this.shared.add(mt) } })
      return out
    }
    const url = team === 'mercedes' ? './assets/w11_lh2020_high.glb' : `./cars/${carOfTeam(team)}_hi.glb`
    const g = await loadGLB(url, () => {}, this.ren.ktxAny())
    const out: Mat[] = []
    g.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      for (const mt of [m.material].flat() as Mat[]) {
        if (out.includes(mt)) continue
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'] as const) { const t = mt[k]; if (t) dropTopMip(t) }
        readableLivery(mt); out.push(mt)
      }
      m.geometry.dispose()
    })
    return out
  }
  private async proto(team: string) {
    const mats = await this.teamMats(team)
    const id = team === 'mercedes' ? 'mercedes' : carOfTeam(team)
    const [g1, g2] = await Promise.all([loadGLB(`./cars/${id}_lod1.glb`, () => {}), loadGLB(`./cars/${id}_lod2.glb`, () => {})])
    for (const g of [g1, g2]) {
      const r = bindLivery(g.scene, mats, this.shared)
      g.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.frustumCulled = true; m.castShadow = false; m.receiveShadow = false })
      if (r.hit === 0) dlog(`livrée ${team} : aucun matériau relié (${r.miss} manqués)`)
    }
    let seat = [0, 0, 0]
    if (id !== 'mercedes') { try { const meta = await (await fetch(`./cars/${id}.json`)).json() as { seat_gltf?: number[] }; seat = meta.seat_gltf ?? seat } catch { /* casque au défaut */ } }
    const hm = new THREE.MeshStandardMaterial({ color: teamAccent(team), roughness: 0.35, metalness: 0.1 })
    for (const g of [g1, g2]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, g === g1 ? 10 : 6, g === g1 ? 8 : 4), hm)
      h.scale.set(1, 0.92, 1.12); h.position.set(seat[0], 0.83 + seat[1], -0.2 + seat[2]); h.name = 'helmet'; h.castShadow = false; g.scene.add(h)
    }
    const tri = (o: THREE.Object3D) => { let n = 0; o.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) n += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 }); return n }
    this.stats.tris1 = Math.max(this.stats.tris1, tri(g1.scene)); this.stats.tris2 = Math.max(this.stats.tris2, tri(g2.scene))
    this.protos.set(team, { l1: g1.scene, l2: g2.scene })
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
      const lod = new THREE.LOD(), a = p.l1.clone(), b = p.l2.clone()
      lod.addLevel(a, 0); lod.addLevel(b, LOD1); lod.addLevel(new THREE.Object3D(), LOD2)
      lod.matrixAutoUpdate = false; lod.name = 'ai_' + r.id
      const wheels = [...collectWheels(a), ...collectWheels(b)]
      const blob = new THREE.Mesh(bg, bm); blob.matrixAutoUpdate = false; blob.renderOrder = 1
      this.root.add(lod, blob); this.views.push({ r, obj: lod, wheels, blob, pitch: 0, roll: 0, spin: 0 })
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
    for (const v of this.views) {
      const r = v.r
      const gone = !!(r as Racer & { _gone?: boolean })._gone
      const hide = r.mode === 'garage' || (!!r.out && r.mode === 'dnf' && r.v < 0.5 && gone)
      v.obj.visible = !hide; v.blob.visible = !hide && r.v > 2
      if (hide) continue
      const phase = (r as Racer & { pitPhase?: string }).pitPhase ?? ''
      const jacked = phase === 'jack' || phase === 'guns' || phase === 'off' || phase === 'on' || phase === 'drop'
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
        vy.set(r.nx, r.ny, r.nz); vz.set(-r.hx, 0, -r.hz); vz.addScaledVector(vy, -vz.dot(vy)).normalize(); vx.crossVectors(vy, vz)
        m4.makeBasis(vx, vy, vz)
        eT.set(v.pitch, 0, v.roll); mR.makeRotationFromEuler(eT); m4.multiply(mR)
      }
      m4.setPosition(r.wx, r.wy + (jacked ? 0.09 : 0), r.wz)
      v.obj.matrix.copy(m4); v.obj.matrixWorldNeedsUpdate = true
      v.blob.matrix.copy(m4); v.blob.matrix.elements[13] = r.wy + 0.03; v.blob.matrixWorldNeedsUpdate = true
      v.obj.update(cam)
      v.spin -= r.v / 0.33 * dt
      const steer = Math.max(-0.42, Math.min(0.42, r.steer ?? 0))
      const wheelsOff = phase === 'off'
      for (const w of v.wheels) { w.spin.visible = !wheelsOff; w.spin.rotation.x = v.spin; if (w.steer) w.steer.rotation.y = steer }
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
