#!/usr/bin/env node
/** Build per-tile far-distance LODs without changing the full-quality source tiles.
 * Usage: node tools/make_track_lods.mjs --tiles /path/to/tiles [--ratio 0.35] [--error 0.01] [--force]
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { prune, simplifyPrimitive } from '@gltf-transform/functions'

const args = process.argv.slice(2)
function arg(name, fallback) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback }
const tilesDir = path.resolve(arg('--tiles', ''))
if (!arg('--tiles', '')) throw new Error('--tiles is required')
const ratio = Number(arg('--ratio', '0.35'))
const error = Number(arg('--error', '0.01'))
const force = args.includes('--force')
if (!(ratio > 0 && ratio < 1) || !(error > 0)) throw new Error('ratio must be (0,1), error must be positive')

const manifestPath = path.join(tilesDir, 'tiles.json')
const tileManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const cachePath = path.join(path.dirname(tilesDir), `${path.basename(tilesDir)}_lod_manifest.json`)
let oldCache = {}
try { oldCache = JSON.parse(await readFile(cachePath, 'utf8')) } catch {}
const cacheTiles = oldCache.ratio === ratio && oldCache.error === error ? (oldCache.tiles ?? {}) : {}
const cache = {}
const criticalSurface = /^(asph|asph_new|asph-grv|asph_pitlane_old|asph-pitlane-old|asph-pitlane-old-red|road-ext-tile|groove\d?|groove_custom|line|doted_line|kerb_new|CURB_B|carpet|carpet-full|carpet-blue|grass-side1|GRASS|sand|sand_new|Parking|new_AO|asph_patch_joint|diss2)(\.\d+)?$/
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex')
const exists = async file => { try { await stat(file); return true } catch { return false } }
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })

for (const tile of tileManifest.tiles) {
  if (tile.id === 'base') continue // global context is loaded once at every quality level
  const input = path.join(tilesDir, tile.file)
  const outputName = tile.file.replace(/\.gltf$/i, '_lod.gltf')
  const output = path.join(tilesDir, outputName)
  const sourceHash = await hash(input)
  const old = cacheTiles[tile.id]
  if (!force && old?.source_sha256 === sourceHash && old?.ratio === ratio && old?.error === error && await exists(output)) {
    const outputDoc = JSON.parse(await readFile(output, 'utf8'))
    const outFiles = [output, ...(outputDoc.buffers ?? []).filter(b => typeof b.uri === 'string').map(b => path.join(tilesDir, b.uri))]
    const currentHashes = {}
    let valid = true
    for (const f of outFiles) {
      if (!await exists(f)) { valid = false; break }
      currentHashes[path.relative(tilesDir, f)] = await hash(f)
    }
    if (valid && JSON.stringify(currentHashes) === JSON.stringify(old.output_sha256)) {
      cache[tile.id] = old
      console.log(`LOD cache hit ${tile.id}`)
      continue
    }
  }

  const doc = await io.read(input)
  const primitives = doc.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives())
  const before = primitives.reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? 0) / 3, 0)
  let simplified = 0
  for (const primitive of primitives) {
    const material = primitive.getMaterial(), indices = primitive.getIndices()
    if ((material && criticalSurface.test(material.getName())) || !indices || indices.getCount() < 300) continue
    simplifyPrimitive(primitive, { simplifier: MeshoptSimplifier, ratio, error, lockBorder: true })
    simplified++
  }
  await doc.transform(prune())
  const buffers = doc.getRoot().listBuffers()
  const stem = path.basename(outputName, '.gltf')
  buffers.forEach((buffer, i) => buffer.setURI(`${stem}${i ? `_${i}` : ''}.bin`))
  await io.write(output, doc)

  const saved = JSON.parse(await readFile(output, 'utf8'))
  const outFiles = [output, ...(saved.buffers ?? []).filter(b => typeof b.uri === 'string').map(b => path.join(tilesDir, b.uri))]
  const outputHashes = {}
  for (const f of outFiles) {
    if (!await exists(f)) throw new Error(`LOD output missing: ${f}`)
    outputHashes[path.relative(tilesDir, f)] = await hash(f)
  }
  const after = doc.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives()).reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? 0) / 3, 0)
  cache[tile.id] = { source_sha256: sourceHash, ratio, error, triangles_before: Math.round(before), triangles_after: Math.round(after), simplified_primitives: simplified, output_sha256: outputHashes }
  console.log(`LOD ${tile.id}: ${Math.round(before)} → ${Math.round(after)} tris (${((1 - after / Math.max(1, before)) * 100).toFixed(1)}% fewer), ${simplified} primitives`)
}
await writeFile(cachePath, JSON.stringify({ schema_version: 1, ratio, error, tiles: cache }, null, 2) + '\n')
console.log(`LOD manifest: ${cachePath}`)
