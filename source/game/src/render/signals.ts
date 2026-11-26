import * as THREE from 'three'

/** Panneaux de repli uniquement si activés, sans panneaux chargés, et pas encore créés. */
export function shouldCreateFallbackMarshalBoards(enabled: boolean, lampCount: number, hasFallback: boolean): boolean {
  return enabled && lampCount === 0 && !hasFallback
}

/** Pilote les matériaux de feux rouge/vert nommés dans la scène. */
export function paintLight(node: THREE.Object3D | undefined, green: boolean) {
  if (!node) return
  node.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mt = m.material as THREE.MeshStandardMaterial
    if (!mt?.emissive) return
    const name = o.name + (mt.name ?? '')
    const isG = /green/i.test(name), isR = /red/i.test(name)
    const on = green ? isG : isR
    if (!isG && !isR) return
    mt.emissive.set(on ? (isG ? 0x20ff60 : 0xff2208) : 0x000000)
    mt.emissiveIntensity = on ? 4 : 0
  })
}
