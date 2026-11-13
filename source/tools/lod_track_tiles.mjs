// Produit les variantes lointaines des tuiles d’une piste (tNN_lod.gltf/.bin).
// Usage: node lod_track_tiles.mjs <tile-directory> [ratio=0.2] [error=0.01]
// Les URI de textures restent partagées avec les tuiles pleine résolution.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { simplify, weld } from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import fs from 'node:fs'
import path from 'node:path'

if (!process.argv[2]) throw new Error('usage: node lod_track_tiles.mjs <tile-directory> [ratio=0.2] [error=0.01]')
const dir = path.resolve(process.argv[2])
const ratio = Number(process.argv[3] || 0.2)
const error = Number(process.argv[4] || 0.01)
if (!fs.existsSync(path.join(dir, 'tiles.json'))) throw new Error(`tiles.json absent: ${dir}`)
if (!(ratio > 0 && ratio < 1) || !(error > 0)) throw new Error(`ratio/error invalides: ${ratio}/${error}`)
await MeshoptSimplifier.ready
await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
})
const tiles = fs.readdirSync(dir).filter(f => /^t\d\d\.gltf$/.test(f)).sort()
if (!tiles.length) throw new Error(`aucune tuile tNN.gltf dans ${dir}`)
for (const file of tiles) {
  const doc = await io.read(path.join(dir, file))
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }))
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const out = file.replace('.gltf', '_lod.gltf')
  const bin = out.replace('.gltf', '.bin')
  for (const buffer of doc.getRoot().listBuffers()) buffer.setURI(bin)
  await io.write(path.join(dir, out), doc)
  let triangles = 0
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives())
    triangles += (prim.getIndices()?.getCount() ?? 0) / 3
  console.log(`${out}: ${Math.round(triangles)} triangles, ratio=${ratio}, error=${error}`)
}
