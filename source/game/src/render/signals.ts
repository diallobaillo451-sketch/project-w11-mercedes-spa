import * as THREE from 'three'

type EmissiveMaterial = THREE.MeshStandardMaterial

/** Monza ne reçoit des panneaux de repli que si le fichier source porte des postes mesurés. */
export function marshalBoardFallbackAllowed(circuit: string, posts?: readonly unknown[] | null) {
  return circuit !== 'monza' || (posts?.length ?? 0) > 0
}

/** Aucun panneau physique ne doit être créé sans autorisation, sans asset natif ou après un premier rendu. */
export function shouldCreateFallbackMarshalBoards(allowed: boolean, lampCount: number, boardsCreated: boolean) {
  return allowed && lampCount === 0 && !boardsCreated
}

export function pitExitLampFallbackAllowed(circuit: string, measuredAnchor: boolean) {
  return circuit !== 'monza' || measuredAnchor
}

/** Active le feu rouge ou vert natif selon l’état de sortie des stands. */
export function paintLight(node: THREE.Object3D | undefined, green: boolean) {
  if (!node) return
  node.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return
    const mt = m.material as EmissiveMaterial
    if (!mt?.emissive) return
    const name = o.name + (mt.name ?? '')
    const isG = /green/i.test(name), isR = /red/i.test(name)
    const on = green ? isG : isR
    if (!isG && !isR) return
    mt.emissive.set(on ? (isG ? 0x20ff60 : 0xff2208) : 0x000000)
    mt.emissiveIntensity = on ? 4 : 0
  })
}
