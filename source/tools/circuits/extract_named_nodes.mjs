// Extract named nodes from a glTF/GLB into a new GLB (keeps meshopt/KTX2 if present).
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune, dedup } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import fs from 'node:fs'
import path from 'node:path'

const [,, src, dst, ...patterns] = process.argv
if (!src || !dst || !patterns.length) {
  console.error('usage: extract_named_nodes.mjs src.gltf dst.glb prefixOrRegex...')
  process.exit(1)
}
await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const doc = await io.read(src)
const root = doc.getRoot()
const match = (name) => patterns.some(p => {
  if (p.startsWith('/') && p.endsWith('/')) return new RegExp(p.slice(1, -1), 'i').test(name || '')
  return (name || '').startsWith(p) || (name || '') === p
})

const kept = []
const keptSet = new Set()
for (const node of root.listNodes()) {
  if (match(node.getName())) { kept.push(node); keptSet.add(node) }
}
if (!kept.length) {
  console.error('no nodes matched', patterns, 'in', src)
  process.exit(2)
}
// include descendants of kept
const addDesc = (n) => { for (const c of n.listChildren()) { keptSet.add(c); addDesc(c) } }
for (const n of kept) addDesc(n)
console.log('kept', [...keptSet].map(n => n.getName()))

const scene = root.listScenes()[0] || doc.createScene('kit')
for (const n of [...scene.listChildren()]) scene.removeChild(n)
// dispose nodes that are not kept
for (const n of [...root.listNodes()]) {
  if (!keptSet.has(n)) n.dispose()
}
for (const n of kept) {
  const parents = n.listParents().filter(x => x.propertyType === 'Node')
  const hasKeptAncestor = parents.some(p => keptSet.has(p))
  if (!hasKeptAncestor) scene.addChild(n)
}
await doc.transform(prune({ keepLeaves: false, keepAttributes: false }), dedup())
fs.mkdirSync(path.dirname(dst), { recursive: true })
await io.write(dst, doc)
console.log('wrote', dst, fs.statSync(dst).size)
