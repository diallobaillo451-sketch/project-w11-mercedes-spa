/** Ancres de circuit (contrat Ty). Noms stables ; les nœuds historiques de Spa sont aliasés.
 *  Absent → la logique continue sans la scène 3D. */
import * as THREE from 'three'

export interface Anchor { name: string; pos: THREE.Vector3; yaw: number; node: THREE.Object3D }
/** nom interne Spa → nom contractuel */
export const ANCHOR_ALIAS: Record<string, string> = {
  pitbox_stop: 'anchor_garage_stop',
  car1_park: 'anchor_garage_park',
  jack_front: 'anchor_jack_front',
  jack_rear: 'anchor_jack_rear',
  screen_1: 'anchor_pitscreen_1',
  screen_2: 'anchor_pitscreen_2',
  screen_3: 'anchor_pitscreen_3',
  eng_desk_1: 'anchor_engineer',
  pitexit_red: 'anchor_pit_exit_light',
  pitexit_green: 'anchor_pit_exit_light',
  pitbox_red: 'anchor_pit_box_light',
  pitbox_green: 'anchor_pit_box_light',
}

/** nœuds de la voie des stands, tels que Ty les nomme dans le GLB */
export const PIT_NODES = ['pit_entry', 'pit_speed_start', 'pit_speed_end', 'pit_exit_light', 'pit_exit', 'pitlane_path'] as const

export function collectAnchors(root: THREE.Object3D, into = new Map<string, Anchor>()) {
  const wp = new THREE.Vector3()
  const pit = new Set<string>(PIT_NODES)
  root.traverse(o => {
    const raw = o.name || ''
    const name = raw.startsWith('anchor_') ? raw : (ANCHOR_ALIAS[raw] ?? (pit.has(raw) ? raw : ''))
    if (!name) return
    if (into.has(name) && raw !== name) return
    o.getWorldPosition(wp)
    const e = new THREE.Euler().setFromQuaternion(o.getWorldQuaternion(new THREE.Quaternion()), 'YXZ')
    into.set(name, { name, pos: wp.clone(), yaw: e.y, node: o })
  })
  return into
}

export interface PitAnchorData {
  pit_entry?: { x: number; z: number }
  pit_speed_start?: { x: number; z: number }
  pit_speed_end?: { x: number; z: number }
  pit_exit?: { x: number; z: number }
  pit_exit_light?: { x: number; z: number }
  pitlane_path?: { x: number[]; z: number[] }
}

/** Lit les ancres déjà collectées, plus la spline `pitlane_path` (enfants ordonnés, sinon sommets du mesh). */
export function readPitAnchors(root: THREE.Object3D, anchors?: Map<string, Anchor>): PitAnchorData {
  const map = anchors ?? collectAnchors(root)
  const out: PitAnchorData = {}
  const put = (key: keyof Omit<PitAnchorData, 'pitlane_path'>) => {
    const a = map.get(key); if (a) out[key] = { x: a.pos.x, z: a.pos.z }
  }
  put('pit_entry'); put('pit_speed_start'); put('pit_speed_end'); put('pit_exit'); put('pit_exit_light')
  const node = map.get('pitlane_path')?.node ?? root.getObjectByName('pitlane_path')
  if (node) {
    const path = pathOf(node)
    if (path && path.x.length > 4) out.pitlane_path = path
  }
  return out
}

function pathOf(node: THREE.Object3D): { x: number[]; z: number[] } | null {
  const v = new THREE.Vector3()
  if (node.children.length >= 2) {
    const ordered = [...node.children].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    const x: number[] = [], z: number[] = []
    for (const c of ordered) { c.updateWorldMatrix(true, false); c.getWorldPosition(v); x.push(v.x); z.push(v.z) }
    return { x, z }
  }
  const mesh = (node as THREE.Mesh).isMesh ? node as THREE.Mesh : node.getObjectByProperty('isMesh', true) as THREE.Mesh | undefined
  const attr = mesh?.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!mesh || !attr) return null
  mesh.updateWorldMatrix(true, false)
  const x: number[] = [], z: number[] = []
  const step = Math.max(1, Math.floor(attr.count / 800))
  for (let i = 0; i < attr.count; i += step) {
    v.fromBufferAttribute(attr, i).applyMatrix4(mesh.matrixWorld)
    if (x.length && Math.hypot(v.x - x[x.length - 1], v.z - z[z.length - 1]) < 0.4) continue
    x.push(v.x); z.push(v.z)
  }
  return x.length > 4 ? { x, z } : null
}
