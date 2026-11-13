import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TrackSurface, newSample } from '../src/track/surface.ts'
import { CIRCUITS } from '../src/core/circuit.ts'
import { Grass } from '../src/render/grass.ts'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../public')
const trackDir = resolve(publicDir, 'track_interlagos')
const sceneDir = resolve(publicDir, 'assets/interlagos_2023')
assert.equal(CIRCUITS.interlagos.trackDir, './track_interlagos/')
assert.equal(CIRCUITS.interlagos.barriersFile, null, 'do not parse a missing barrier file')
assert.equal(CIRCUITS.interlagos.pitlaneFile, null)
assert.equal(CIRCUITS.interlagos.grassMaskFile, 'grassmask.bin')
assert.equal(CIRCUITS.interlagos.crowdFile, null)
const meta = JSON.parse(readFileSync(resolve(trackDir, 'surface.json'), 'utf8'))
const bytes = readFileSync(resolve(trackDir, 'surface.bin'))
assert.equal(bytes.byteLength, meta.N * meta.ND * 2, 'surface.bin must exactly match N × ND uint16 cells')
assert.ok(meta.length > 4200 && meta.length < 4300, 'measured Interlagos lap length is out of expected range')
assert.equal(meta.cx.length, meta.N)
assert.equal(meta.cy.length, meta.N)
assert.equal(meta.cz.length, meta.N)
assert.equal(meta.wl.length, meta.N)
assert.equal(meta.wr.length, meta.N)

const grid = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
const jc = (meta.ND - 1) >> 1
let centerAsphalt = 0
let grassCells = 0
for (let i = 0; i < meta.N; i++) {
  if ((grid[i * meta.ND + jc] & 7) === 1) centerAsphalt++
  for (let j = 0; j < meta.ND; j++) if ((grid[i * meta.ND + j] & 7) === 4) grassCells++
}
assert.ok(centerAsphalt / meta.N > 0.995, 'at least 99.5% of centerline cells must be asphalt')
assert.ok(grassCells > 1000, 'grass/run-off cells must be represented')
const grassMask = readFileSync(resolve(trackDir, 'grassmask.bin'))
assert.equal(grassMask.readUInt16LE(0), 26, 'grassmask column origin must match the -32 m window')
assert.equal(grassMask.readUInt16LE(2), 128, 'grassmask width must be even for nibble packing')
assert.equal(grassMask.byteLength, 4 + meta.N * 64, 'grassmask must contain one packed row per center sample')
assert.equal(meta.center_gap_fallback?.object, 'Object_87', 'the single audited seam fallback must be documented')
assert.equal(meta.center_gap_fallback?.index, 3849)

const surface = new TrackSurface(meta, grid)
const grassMaskBuffer = grassMask.buffer.slice(grassMask.byteOffset, grassMask.byteOffset + grassMask.byteLength)
const grass = new Grass(surface, grassMaskBuffer, 0.6, 8000)
assert.ok(grass.n > 0, 'Object_24 grassmask must create instanced grass tufts')
const sample = newSample()
for (let i = 0; i < meta.N; i += 25) {
  const q = surface.sample(meta.cx[i], meta.cz[i], i, sample)
  assert.equal(q.type, 1, `centerline station ${i} must resolve to asphalt`)
  assert.ok(Number.isFinite(q.h) && Number.isFinite(q.nx) && Number.isFinite(q.ny) && Number.isFinite(q.nz))
}

const manifestPath = resolve(sceneDir, 'tiles.json')
assert.ok(existsSync(manifestPath), 'tiles.json is required')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert.ok(Array.isArray(manifest.tiles) && manifest.tiles.length >= 2, 'spatial tile manifest must contain multiple tiles')
for (const tile of manifest.tiles) {
  assert.ok(existsSync(resolve(sceneDir, tile.file)), `missing tile ${tile.file}`)
  for (const uri of tile.tex ?? []) assert.ok(existsSync(resolve(sceneDir, uri)), `missing tile texture ${uri}`)
}
assert.ok(!JSON.stringify(manifest).includes('Image_98'), 'satellite texture Image_98 must not be referenced')
console.log(`OK Interlagos: ${meta.N} center samples, ${manifest.tiles.length} tiles, ${grass.n} grass tufts, ${Math.round(bytes.byteLength / 1024)} KiB surface.bin, ${meta.length.toFixed(1)} m measured lap`)
