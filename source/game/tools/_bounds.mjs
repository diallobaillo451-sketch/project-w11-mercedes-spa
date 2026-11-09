import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/core'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read('public/assets/w11_lh2020_high.glb')
for (const n of doc.getRoot().listNodes()) { const nm = n.getName(); if (/Visor|Eyes|STEERING|hand|head$|Helmet_Base|DRV_rig|tvcam|HALO|halo/i.test(nm)) { const b = getBounds(n); console.log(nm.padEnd(50), b.min.map(v=>v.toFixed(3)).join(','), '|', b.max.map(v=>v.toFixed(3)).join(','), 'parent', n.getParentNode()?.getName()) } }
