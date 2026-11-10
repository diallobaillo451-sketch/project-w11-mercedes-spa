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
  pitlane?: { points_xyzs?: number[][]; entry_s?: number; exit_s?: number }
  pit_exit_lights?: { pos?: number[] }
  player_garage?: { npc_spots?: NpcSpot[] }
  garages?: { team: string; frame?: { pos: number[]; yaw: number }; pit_stop?: { pos: number[]; heading?: number[] }; car_park?: number[][]; lod_node?: string }[]
}

const mixers: THREE.AnimationMixer[] = []
/** PNJ du garage (clips Mixamo) : à appeler à chaque image */
export function updateGarageAnims(dt: number) { for (const m of mixers) m.update(dt) }

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
