/** Livrées 2020 : association des matériaux LOD aux matériaux haute définition.
 *  Le nom exact rate souvent (suffixe .L1, rôle seul). On retombe alors sur le rôle
 *  (peinture, carbone, pneu, jante, décal, feu). Une peinture à metalness 0,8 sous le ciel
 *  HDRI sort argentée : on la ramène à une peinture vernie (métal bas + clearcoat). */
import * as THREE from 'three'

export type Pbr = THREE.MeshStandardMaterial

export function matRole(name: string): string {
  const n = name.toLowerCase()
  if (/paint|merc1|livery/.test(n)) return 'paint'
  if (/carbon/.test(n)) return 'carbon'
  if (/tyre|tire|pneu/.test(n)) return 'tyre'
  if (/hub|rim/.test(n) && !/blur/.test(n)) return 'hub'
  if (/decal|logo|number|stripe|werace/.test(n)) return 'decal'
  if (/light|led|lamp/.test(n)) return 'light'
  if (/disc|brake/.test(n)) return 'disc'
  if (/glass|visor/.test(n)) return 'glass'
  if (/caliper/.test(n)) return 'caliper'
  return 'other'
}
export function normMat(name: string) {
  return name.toLowerCase().replace(/(\.\d+)+$/g, '').replace(/\.l\d+$/i, '').replace(/_l\d+$/i, '')
}

/** Peinture de carrosserie : le vernis porte la couleur, le métal ne doit pas manger l'albédo. */
export function readableLivery(mt: Pbr) {
  if (mt.userData.liv) return
  mt.userData.liv = 1
  if (matRole(mt.name) !== 'paint') return
  if (/safety/i.test(mt.name)) { mt.metalness = Math.min(mt.metalness, 0.55); return }
  if (mt.metalness > 0.35) mt.metalness = 0.16
  const p = mt as THREE.MeshPhysicalMaterial
  if (p.isMeshPhysicalMaterial) {
    p.clearcoat = Math.max(p.clearcoat ?? 0, 0.88)
    p.clearcoatRoughness = Math.min(p.clearcoatRoughness > 0 ? p.clearcoatRoughness : 0.08, 0.12)
  }
}

export function bindLivery(root: THREE.Object3D, mats: Pbr[], shared: Set<THREE.Material>) {
  const byName = new Map<string, Pbr>()
  const byRole = new Map<string, Pbr>()
  for (const m of mats) {
    if (!m) continue
    byName.set(m.name, m)
    byName.set(normMat(m.name), m)
    const role = matRole(m.name)
    const prev = byRole.get(role)
    if (!prev || (!!m.map && !prev.map)) byRole.set(role, m)
  }
  const trash = new Set<THREE.Material>()
  let hit = 0, miss = 0
  root.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const cur = mesh.material as Pbr
    if (!cur?.isMeshStandardMaterial) return
    const hi = byName.get(cur.name) ?? byName.get(normMat(cur.name)) ?? (matRole(cur.name) !== 'other' ? byRole.get(matRole(cur.name)) : undefined)
    if (hi && hi !== cur) {
      if (!shared.has(cur)) trash.add(cur)
      mesh.material = hi
      hit++
    } else miss++
    const now = mesh.material as Pbr
    if (now?.isMeshStandardMaterial && !shared.has(now)) readableLivery(now)
  })
  for (const mt of trash) mt.dispose()
  return { hit, miss }
}
