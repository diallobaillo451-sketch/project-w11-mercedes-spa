// LOD des tuiles lointaines : géométrie simplifiée (meshoptimizer), mêmes textures (URI partagées) → tNN_lod.gltf/.bin
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { simplify, weld } from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import fs from 'node:fs'
const D = 'public/assets/spa/', O = '/tmp/lod/'; fs.mkdirSync(O, { recursive: true })
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const ratio = +(process.argv[2] || 0.2), err = +(process.argv[3] || 0.01)
for (const f of fs.readdirSync(D).filter(f => /^t\d\d\.gltf$/.test(f))) {
  const doc = await io.read(D + f)
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: err, lockBorder: false }))
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const n = f.replace('.gltf', '_lod.gltf'); doc.getRoot().listBuffers().forEach(b => b.setURI(n.replace('.gltf', '.bin'))); await io.write(O + n, doc)
  const g = JSON.parse(fs.readFileSync(O + n)); fs.copyFileSync(O + n, D + n); for (const b of g.buffers) if (b.uri) fs.copyFileSync(O + b.uri, D + b.uri)
  let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3
  console.log(n, Math.round(tris), g.buffers.map(b => b.uri), g.images?.[0]?.uri)
}
