/** Stands de Spa livrés par Ty (shared/assets/spa_pits). Monde déjà placé, sauf le garage joueur qui reçoit la pose de son équipe.
 *  Garage du joueur : PNJ animés (bureau, équipe), portes des tuiles retirées, repère de sortie pour game.garage.
 *  Absent du dépôt : on continue avec pitlane.json. */
import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import type { Game } from '../core/game.ts'
import { loadGLB, type Renderer } from './renderer.ts'
import type { FieldView } from './fieldView.ts'
import { dlog } from '../diag.ts'

interface NpcSpot { id: string; kind: string; pos: number[]; yaw: number; clip?: string }
interface PitFile {
  circuit?: string
  pitlane?: { points_xyzs?: number[][]; entry_s?: number; exit_s?: number }
  pit_exit_lights?: { pos?: number[] }
  player_garage?: { npc_spots?: NpcSpot[] }
  garages?: { team: string; frame?: { pos: number[]; yaw: number }; pit_stop?: { pos: number[]; heading?: number[] }; car_park?: number[][]; lod_node?: string; pitwall?: { node: string; pos: number[]; yaw: number } }[]
}

const mixers: THREE.AnimationMixer[] = []
interface PitCrewActor { id: string; root: THREE.Object3D; actions: Map<string, THREE.AnimationAction>; active: string }
const pitCrewActors: PitCrewActor[] = []
/** PNJ du garage (clips Mixamo) : à appeler à chaque image */
export function updateGarageAnims(dt: number, phase = '') {
  const active = new Set(['jack', 'guns', 'off', 'on', 'drop'])
  for (const actor of pitCrewActors) {
    const jack = actor.id.startsWith('mech_jack_'), offHelper = actor.id.endsWith('_off')
    const shown = jack ? active.has(phase) : offHelper ? phase === 'off' || phase === 'on' : phase === 'guns' || phase === 'off' || phase === 'on'
    const clip = !shown ? '' : jack ? 'jack_push' : offHelper ? 'idle_var' : 'tyre_change'
    actor.root.visible = shown
    if (clip === actor.active) continue
    actor.actions.get(actor.active)?.fadeOut(0.12)
    const next = actor.actions.get(clip)
    if (next) next.reset().fadeIn(0.12).play()
    actor.active = clip
  }
  for (const m of mixers) m.update(dt)
}

const doneDoors = new WeakSet<THREE.Object3D>()
const isDoor = (o: THREE.Object3D) => { let p: THREE.Object3D | null = o; for (let i = 0; p && i < 3; i++, p = p.parent) if (/box-door/i.test(p.name)) return true; return false }
/** retire les triangles de la porte (mesh box-door__far des tuiles de piste) devant le garage du joueur */
export function openGarageDoors(root: THREE.Object3D, g: { x: number; z: number; yaw: number } | null) {
  if (!g) return 0
  const sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), v = new THREE.Vector3()
  let removed = 0
  root.updateWorldMatrix(true, true)
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh || doneDoors.has(m) || !isDoor(o)) return
    doneDoors.add(m)
    const geo = m.geometry, pos = geo.getAttribute('position'), idx = geo.index
    if (!pos) return
    m.updateWorldMatrix(true, false)
    const n = idx ? idx.count : pos.count
    const keep: number[] = []
    for (let t = 0; t + 2 < n; t += 3) {
      let cx = 0, cz = 0
      for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(m.matrixWorld); cx += v.x / 3; cz += v.z / 3 }
      const dx = cx - g.x, dz = cz - g.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs
      if (Math.abs(lx) < 12 && lz > -16 && lz < 5) { removed++; continue }
      for (let k = 0; k < 3; k++) keep.push(idx ? idx.getX(t + k) : t + k)
    }
    if (keep.length < n) geo.setIndex(keep)
  })
  if (removed) dlog('garage joueur : ' + removed + ' triangles de porte retirés')
  return removed
}

export async function loadSpaPits(game: Game, ren: Renderer, fview: FieldView, team: string) {
  const res = await fetch('./assets/spa_pits/pits.json')
  if (!res.ok || !game.pit) return
  const pits = await res.json() as PitFile
  const ktx = ren.ktxAny()
  const root = new THREE.Group(); root.name = 'spa_pits'; ren.scene.add(root)
  const add = async (url: string) => {
    try { const g = await loadGLB(url, () => {}, ktx); root.add(g.scene); return g.scene }
    catch (e) { dlog('stands ' + url + ' : ' + (e as Error).message); return null }
  }
  const [lod, lights] = await Promise.all([
    add('./assets/spa_pits/garages_lod.glb'),
    add('./assets/spa_pits/pit_exit_lights.glb'),
    add('./assets/spa_pits/pitwall_stands.glb'),
  ])
  if (lights) fview.adoptScene(lights)
  const mine = pits.garages?.find(g => g.team === team) ?? pits.garages?.[0]
  const garage = await add('./assets/spa_pits/garage_player.glb')
  if (garage && mine?.frame) {
    garage.position.set(mine.frame.pos[0], mine.frame.pos[1], mine.frame.pos[2])
    garage.rotation.y = mine.frame.yaw
    fview.adoptScene(garage)
    const hide = lod?.getObjectByName(mine.lod_node || 'garage_lod_' + mine.team)
    if (hide) hide.visible = false
    // repère du garage pour la sortie de la voiture et la caméra intérieure (local : +Z vers la voie, +X vers l'entrée de la voie)
    const car1 = mine.car_park?.[0]
    if (car1 && mine.pit_stop) {
      const fr = mine.frame, sn = Math.sin(fr.yaw), cs = Math.cos(fr.yaw)
      const h = mine.pit_stop.heading ?? [-cs, 0, sn]
      const cam = [fr.pos[0] + 3.0 * cs - 11.6 * sn, fr.pos[1] + 1.7, fr.pos[2] - 3.0 * sn - 11.6 * cs]
      game.garage = { x: fr.pos[0], y: fr.pos[1], z: fr.pos[2], yaw: fr.yaw, park: car1, stop: mine.pit_stop.pos, lane: [h[0], h[2]], cam }
      ren.cams.gPos.set(cam[0], cam[1], cam[2])
      dlog('garage joueur : sortie et caméra intérieure prêtes (' + mine.team + ')')
    }
    openGarageDoors(ren.scene, game.garage)
    // équipe et bureau d'ingénieurs animés (les postes de l'arrêt au stand — cric, pneus — restent vides)
    const skip = /^(mech_jack|mech_tyre|crew_front_4)/
    const spots = (pits.player_garage?.npc_spots ?? []).filter(s => !skip.test(s.id))
    for (const kind of ['engineer', 'mechanic']) {
      const list = spots.filter(s => s.kind === kind)
      if (!list.length) continue
      try {
        const src = await loadGLB(`./assets/spa_pits/npc_${kind}.glb`, () => {}, ktx)
        const anims = (src as unknown as { animations?: THREE.AnimationClip[] }).animations ?? []
        for (const s of list) {
          const npc = SkeletonUtils.clone(src.scene) as THREE.Object3D
          npc.position.set(s.pos[0], s.pos[1], s.pos[2]); npc.rotation.y = s.yaw
          garage.add(npc)
          const clip = THREE.AnimationClip.findByName(anims, s.clip ?? 'idle') ?? THREE.AnimationClip.findByName(anims, 'idle')
          if (!clip) continue
          const mx = new THREE.AnimationMixer(npc), act = mx.clipAction(clip)
          act.time = Math.random() * clip.duration; act.play(); mixers.push(mx)
        }
      } catch (e) { dlog('PNJ garage ' + kind + ' : ' + (e as Error).message) }
    }
  }
  const pts = pits.pitlane?.points_xyzs
  if (pts && pts.length > 8) {
    const xz = (i: number) => ({ x: pts[i][0], z: pts[i][2] })
    const nearS = (s: number) => pts.reduce((b, p, i) => Math.abs(p[3] - s) < Math.abs(pts[b][3] - s) ? i : b, 0)
    const light = pits.pit_exit_lights?.pos
    game.adoptPitAnchors({
      pitlane_path: { x: pts.map(p => p[0]), z: pts.map(p => p[2]) },
      pit_entry: xz(0),
      pit_speed_start: xz(nearS(6790)),
      pit_speed_end: xz(nearS(200)),
      pit_exit: xz(pts.length - 1),
      pit_exit_light: light ? { x: light[0], z: light[2] } : undefined,
    })
    for (const g of pits.garages ?? []) if (g.pit_stop) game.pit!.setTeamBox(g.team, g.pit_stop.pos[0], g.pit_stop.pos[2])
  }
  try {
    const src = await loadGLB('./assets/spa_pits/npc_mechanic.glb', () => {}, ktx)
    for (const g of pits.garages ?? []) {
      if (!g.pit_stop || g.team === mine?.team) continue // la case du joueur reste libre : la voiture y arrive
      const npc = SkeletonUtils.clone(src.scene) as THREE.Object3D
      const p = g.pit_stop.pos, h = g.pit_stop.heading
      npc.position.set(p[0], p[1], p[2])
      if (h) npc.rotation.y = Math.atan2(h[0], h[2])
      root.add(npc)
    }
  } catch (e) { dlog('mécaniciens : ' + (e as Error).message) }
  dlog('stands Spa : ' + (pts?.length ?? 0) + ' pts de voie, garage ' + (mine?.team ?? '—'))
}

/** Pitlane Monza : cadres calculés depuis les données du circuit; LOD et muret sont reposés aux ancrages Monza, sans supprimer le décor statique. */
export async function loadMonzaPits(game: Game, ren: Renderer, fview: FieldView, team: string) {
  const res = await fetch('./track_monza/pits.json')
  if (!res.ok || !game.pit) { dlog('stands Monza indisponibles'); return }
  const pits = await res.json() as PitFile
  if (pits.circuit !== 'monza_2020' || !pits.garages?.length) { dlog('configuration stands Monza invalide'); return }
  const ktx = ren.ktxAny(), root = new THREE.Group(); root.name = 'monza_pits'; ren.scene.add(root)
  for (const g of pits.garages) if (g.pit_stop) game.pit.setTeamBox(g.team, g.pit_stop.pos[0], g.pit_stop.pos[2])
  const mine = pits.garages.find(g => g.team === team) ?? pits.garages[0]
  if (!mine.frame || !mine.car_park?.[0] || !mine.pit_stop) { dlog('garage Monza sans ancres joueur'); return }
  const textureCache = new Map<string, Promise<THREE.Texture>>()
  const textureFor = (url: string) => {
    let promise = textureCache.get(url)
    if (!promise) { promise = ktx.loadAsync(url).then(texture => { texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; return texture }); textureCache.set(url, promise) }
    return promise
  }
  const replaceMap = async (obj: THREE.Object3D, url: string, materialName: string) => {
    try {
      const texture = await textureFor(url), variants = new Map<THREE.Material, THREE.Material>()
      obj.traverse(o => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const apply = (material: THREE.Material) => {
          if (material.name !== materialName) return material
          let pbr = variants.get(material) as THREE.MeshStandardMaterial | undefined
          if (!pbr) { pbr = material.clone() as THREE.MeshStandardMaterial; pbr.map = texture; pbr.needsUpdate = true; variants.set(material, pbr) }
          return pbr
        }
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material)
      })
    } catch (e) { dlog('texture équipe ' + url + ' : ' + (e as Error).message) }
  }
  try {
    const lod = await loadGLB('./assets/spa_pits/garages_lod.glb', () => {}, ktx)
    let placed = 0
    for (const g of pits.garages) {
      if (!g.frame) continue
      const name = g.lod_node ?? `garage_lod_${g.team}`
      const anchor = lod.scene.getObjectByName(name + '_frame') ?? lod.scene.getObjectByName(name)
      if (!anchor) { dlog('garage LOD Monza absent : ' + name); continue }
      anchor.position.set(g.frame.pos[0], g.frame.pos[1], g.frame.pos[2])
      anchor.rotation.set(0, g.frame.yaw, 0)
      anchor.visible = g.team !== mine.team
      placed++
    }
    root.add(lod.scene)
    dlog('garages LOD Monza : ' + placed + '/10 · box joueur masqué')
  } catch (e) { dlog('garages LOD Monza : ' + (e as Error).message) }
  let pitwallScene: THREE.Object3D | null = null
  try {
    const src = await loadGLB('./assets/spa_pits/pitwall_stands.glb', () => {}, ktx)
    pitwallScene = src.scene
    let placed = 0
    for (const g of pits.garages) {
      if (!g.pitwall) continue
      const stand = pitwallScene.getObjectByName(g.pitwall.node)
      if (!stand) { dlog('stand muret Monza absent : ' + g.pitwall.node); continue }
      stand.position.set(g.pitwall.pos[0], g.pitwall.pos[1], g.pitwall.pos[2])
      stand.rotation.set(0, g.pitwall.yaw, 0)
      placed++
    }
    root.add(pitwallScene); root.updateMatrixWorld(true)
    dlog('stands du muret Monza : ' + placed + '/10')
  } catch (e) { pitwallScene = null; dlog('stands du muret Monza : ' + (e as Error).message) }
  if (pitwallScene) try {
    const src = await loadGLB('./assets/spa_pits/npc_engineer.glb', () => {}, ktx), anims = src.animations ?? []
    let crew = 0
    for (const g of pits.garages) {
      if (!g.pitwall) continue
      const stand = pitwallScene.getObjectByName(g.pitwall.node)
      if (!stand) continue
      const teamModel = SkeletonUtils.clone(src.scene) as THREE.Object3D
      const size = g.team === mine.team ? '1024' : '256'
      if (/^[a-z0-9_-]+$/i.test(g.team)) await replaceMap(teamModel, `./assets/spa_pits/npc_tex/npc_engineer_${g.team}_${size}.ktx2`, 'Material_0')
      for (let seatIndex = 1; seatIndex <= 4; seatIndex++) {
        const seat = stand.getObjectByName(`${g.pitwall.node}_seat_${seatIndex}`)
        if (!seat) continue
        seat.updateWorldMatrix(true, false)
        const npc = SkeletonUtils.clone(teamModel) as THREE.Object3D
        npc.position.copy(seat.getWorldPosition(new THREE.Vector3()))
        npc.rotation.y = g.frame?.yaw ?? g.pitwall.yaw - Math.PI
        root.add(npc)
        const wanted = seatIndex % 2 ? 'pitwall_watch' : 'pitwall_talk'
        const clip = THREE.AnimationClip.findByName(anims, wanted) ?? THREE.AnimationClip.findByName(anims, 'idle')
        if (clip) { const mx = new THREE.AnimationMixer(npc), act = mx.clipAction(clip); act.time = Math.random() * clip.duration; act.play(); mixers.push(mx) }
        crew++
      }
    }
    dlog('ingénieurs muret Monza : ' + crew + ' sièges animés')
  } catch (e) { dlog('ingénieurs muret Monza : ' + (e as Error).message) }
  let garage: THREE.Object3D | null = null
  try {
    const src = await loadGLB('./assets/monza_pits/garage_player.glb', () => {}, ktx)
    garage = src.scene; root.add(garage)
    garage.position.set(mine.frame.pos[0], mine.frame.pos[1], mine.frame.pos[2])
    garage.rotation.y = mine.frame.yaw
    if (/^[a-z0-9_-]+$/i.test(mine.team)) await replaceMap(garage, `./assets/monza_pits/textures/team_${mine.team}.ktx2`, 'team')
    fview.adoptScene(garage)
    const fr = mine.frame, h = mine.pit_stop.heading ?? [-Math.cos(fr.yaw), 0, Math.sin(fr.yaw)]
    const cam = [fr.pos[0] + 3.0 * Math.cos(fr.yaw) - 11.6 * Math.sin(fr.yaw), fr.pos[1] + 1.7, fr.pos[2] - 3.0 * Math.sin(fr.yaw) - 11.6 * Math.cos(fr.yaw)]
    game.garage = { x: fr.pos[0], y: fr.pos[1], z: fr.pos[2], yaw: fr.yaw, park: mine.car_park[0], stop: mine.pit_stop.pos, lane: [h[0], h[2]], cam }
    ren.cams.gPos.set(cam[0], cam[1], cam[2])
    dlog('garage Monza : sortie guidée prête (' + mine.team + ')')
  } catch (e) { dlog('garage Monza : ' + (e as Error).message) }
  if (game.garage) openGarageDoors(ren.scene, game.garage)
  if (garage) {
    const skip = /^(mech_jack|mech_tyre|crew_front_4)/
    const allSpots = pits.player_garage?.npc_spots ?? []
    const spots = allSpots.filter(s => !skip.test(s.id))
    for (const kind of ['engineer', 'mechanic']) {
      const dynamic = kind === 'mechanic' ? allSpots.filter(s => /^mech_(jack|tyre)_/.test(s.id)) : []
      const list = [...spots.filter(s => s.kind === kind), ...dynamic]
      if (!list.length) continue
      try {
        const src = await loadGLB(`./assets/spa_pits/npc_${kind}.glb`, () => {}, ktx)
        if (/^[a-z0-9_-]+$/i.test(mine.team)) await replaceMap(src.scene, `./assets/spa_pits/npc_tex/npc_${kind}_${mine.team}_1024.ktx2`, 'Material_0')
        const anims = src.animations ?? []
        for (const s of list) {
          const npc = SkeletonUtils.clone(src.scene) as THREE.Object3D
          npc.position.set(s.pos[0], s.pos[1], s.pos[2]); npc.rotation.y = s.yaw; garage.add(npc)
          if (dynamic.includes(s)) {
            npc.visible = false
            const mx = new THREE.AnimationMixer(npc), actions = new Map<string, THREE.AnimationAction>()
            for (const clip of anims) actions.set(clip.name, mx.clipAction(clip))
            pitCrewActors.push({ id: s.id, root: npc, actions, active: '' }); mixers.push(mx)
            continue
          }
          const clip = THREE.AnimationClip.findByName(anims, s.clip ?? 'idle') ?? THREE.AnimationClip.findByName(anims, 'idle')
          if (!clip) continue
          const mx = new THREE.AnimationMixer(npc), act = mx.clipAction(clip)
          act.time = Math.random() * clip.duration; act.play(); mixers.push(mx)
        }
      } catch (e) { dlog('PNJ garage Monza ' + kind + ' : ' + (e as Error).message) }
    }
  }
  dlog('stands Monza : ' + pits.garages.length + ' cases, LOD, muret et voie native chargés')
}
