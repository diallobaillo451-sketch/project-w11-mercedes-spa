import * as THREE from 'three'
Object.assign(globalThis, { location: new URL('http://localhost/') })
const { createCarLod } = await import('../src/render/fieldView.ts')

function assert(ok: boolean, message: string) {
  if (!ok) throw new Error(message)
}
function car(name: string) {
  const root = new THREE.Group()
  root.name = name
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1, 4.5), new THREE.MeshBasicMaterial()))
  return root
}

const near = car('LOD1'), far = car('LOD2')
const lod = createCarLod(near, far)
const camera = new THREE.PerspectiveCamera()
for (const [distance, expected] of [[0, 0], [27.9, 0], [28, 1], [449, 1], [450, 1], [1500, 1]] as const) {
  camera.position.set(0, 0, distance)
  camera.updateMatrixWorld(true)
  lod.updateMatrixWorld(true)
  lod.update(camera)
  const active = lod.children.map((child, index) => child.visible ? index : -1).filter(index => index >= 0)
  assert(active.length === 1 && active[0] === expected, `distance ${distance} m selects ${active}, expected ${expected}`)
  let hasMesh = false
  lod.children[expected].traverse(object => { if ((object as THREE.Mesh).isMesh && object.visible) hasMesh = true })
  assert(hasMesh, `distance ${distance} m must retain visible car geometry`)
}
console.log('OK: LOD1 switches to LOD2 at 28 m; visible LOD2 persists through 1,500 m')
