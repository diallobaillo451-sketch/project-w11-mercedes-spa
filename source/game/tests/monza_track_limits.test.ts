// Fixture Monza géométrique uniquement : on vérifie les lignes blanches et l'empreinte des quatre pneus,
// sans prétendre valider la trajectoire, la scène ou une course complète sur ce circuit.
import { readFileSync } from 'node:fs'
import { TrackSurface, type SurfaceMeta } from '../src/track/surface.ts'
import { simulatedCarLegalEdges, simulatedCarOutsideTrack } from '../src/track/limits.ts'

function assert(ok: boolean, msg: string) { if (!ok) throw new Error(msg) }
const fixture = JSON.parse(readFileSync(new URL('./fixtures/monza_limits.json', import.meta.url), 'utf8')) as {
  circuit: string; N: number; ds: number; length: number
  wl: number[]; wr: number[]; wallL: number[]; wallR: number[]
}
assert(fixture.circuit === 'Monza 2020', 'le fixture est bien celui de Monza 2020')
const { N, ds, length } = fixture
const ND = 81, D0 = -15, DSTEP = 30 / (ND - 1)
const radius = length / (2 * Math.PI)
const meta: SurfaceMeta = {
  N, ND, D0, DSTEP, ds, length,
  // Centreline circulaire de support seulement; le fixture ne contient pas la géométrie XY réelle de Monza.
  cx: Array.from({ length: N }, (_, i) => radius * Math.cos(i * ds / radius)),
  cy: Array.from({ length: N }, () => 0),
  cz: Array.from({ length: N }, (_, i) => radius * Math.sin(i * ds / radius)),
  wl: fixture.wl, wr: fixture.wr, wallL: fixture.wallL, wallR: fixture.wallR,
}
const grid = new Uint16Array(N * ND)
grid.fill((4096 << 3) | 1)
const track = new TrackSurface(meta, grid)
let smallestLower = Infinity, largestLower = -Infinity, smallestUpper = Infinity, largestUpper = -Infinity
for (let i = 0; i < N; i++) {
  const s = i * ds
  const [minimum, maximum] = simulatedCarLegalEdges(track, s)
  assert(Number.isFinite(minimum) && Number.isFinite(maximum) && minimum <= maximum,
    `intervalle légal signé et fini à s=${s.toFixed(0)} m (min=${minimum}, max=${maximum})`)
  assert(!simulatedCarOutsideTrack(track, s, 0), `la voiture centrée reste dans la piste à s=${s.toFixed(0)} m`)
  assert(!simulatedCarOutsideTrack(track, s, minimum), `les pneus restent à l'intérieur de la limite minimale à s=${s.toFixed(0)} m`)
  assert(!simulatedCarOutsideTrack(track, s, maximum), `les pneus restent à l'intérieur de la limite maximale à s=${s.toFixed(0)} m`)
  assert(simulatedCarOutsideTrack(track, s, -50) && simulatedCarOutsideTrack(track, s, 50),
    `les quatre pneus sont reconnus hors piste loin des lignes à s=${s.toFixed(0)} m`)
  smallestLower = Math.min(smallestLower, minimum); largestLower = Math.max(largestLower, minimum)
  smallestUpper = Math.min(smallestUpper, maximum); largestUpper = Math.max(largestUpper, maximum)
}
console.log(`OK : Monza 2020 — ${N} positions, quatre pneus maintenus dans les limites; enveloppes signées ${smallestLower.toFixed(2)}–${largestLower.toFixed(2)} / ${smallestUpper.toFixed(2)}–${largestUpper.toFixed(2)} m (fixture géométrique uniquement)`)
