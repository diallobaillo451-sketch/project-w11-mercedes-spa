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

export function collectAnchors(root: THREE.Object3D, into = new Map<string, Anchor>()) {
  const wp = new THREE.Vector3()
  root.traverse(o => {
    const raw = o.name || ''
    const name = raw.startsWith('anchor_') ? raw : ANCHOR_ALIAS[raw]
    if (!name) return
    if (into.has(name) && raw !== name) return
    o.getWorldPosition(wp)
    const e = new THREE.Euler().setFromQuaternion(o.getWorldQuaternion(new THREE.Quaternion()), 'YXZ')
    into.set(name, { name, pos: wp.clone(), yaw: e.y, node: o })
  })
  return into
}
