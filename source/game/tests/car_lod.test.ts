import * as THREE from 'three'
Object.assign(globalThis, { location: new URL('http://localhost/') })
const { hideExploded } = await import('../src/render/fieldView.ts')

function assert(ok: boolean, msg: string) { if (!ok) throw new Error(msg) }

const root = new THREE.Group()
const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 5.45), new THREE.MeshStandardMaterial())
body.name = 'redbull_B_redbull_DETAIL.L1'
const corrupted = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 6), new THREE.MeshStandardMaterial())
corrupted.name = 'logo_quantization_error'
root.add(body, corrupted)
hideExploded(root)

assert(body.visible, 'un maillage DETAIL de 5,45 m est la carrosserie complète, pas un maillage explosé')
assert(!corrupted.visible, 'un maillage trop long sans rôle de carrosserie reste masqué')
console.log('OK : protection LOD, carrosserie DETAIL conservée et maillage aberrant filtré')
