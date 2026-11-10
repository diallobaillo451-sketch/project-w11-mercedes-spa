/** Stands de Spa livrés par Ty (shared/assets/spa_pits). Monde déjà placé, sauf le garage joueur
 *  qui reçoit la pose de son équipe. Absent du dépôt : on continue avec pitlane.json. */
import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import type { Game } from '../core/game.ts'
import { loadGLB, type Renderer } from './renderer.ts'
import type { FieldView } from './fieldView.ts'
import { dlog } from '../diag.ts'

interface PitFile {
  pitlane?: { points_xyzs?: number[][]; entry_s?: number; exit_s?: number }
  pit_exit_lights?: { pos?: number[] }
  garages?: { team: string; frame?: { pos: number[]; yaw: number }; pit_stop?: { pos: number[]; heading?: number[] }; lod_node?: string }[]
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
      if (!g.pit_stop) continue
      const npc = SkeletonUtils.clone(src.scene) as THREE.Object3D
      const p = g.pit_stop.pos, h = g.pit_stop.heading
      npc.position.set(p[0], p[1], p[2])
      if (h) npc.rotation.y = Math.atan2(h[0], h[2])
      root.add(npc)
    }
  } catch (e) { dlog('mécaniciens : ' + (e as Error).message) }
  dlog('stands Spa : ' + (pts?.length ?? 0) + ' pts de voie, garage ' + (mine?.team ?? '—'))
}
