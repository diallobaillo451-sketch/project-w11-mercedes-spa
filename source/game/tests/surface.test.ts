// Comportement par surface (Node) : node tests/surface.test.ts
// Voiture lâchée à 150 km/h, pied levé, sur une bande longue de gravier / herbe / asphalte : décélération moyenne,
// distance d'arrêt, enfoncement. Références : pied levé, frein moteur + aéro + récupération ERS compris (asphalte ≈ 0,6 g) ; gravier ≈ +0,3–0,6 g ; herbe ≈ asphalte (peu de traînée, très peu d adhérence).
import { readFileSync } from 'node:fs'
import { Vehicle } from '../src/physics/vehicle.ts'
import { TrackSurface } from '../src/track/surface.ts'
const rd = (f: string) => readFileSync(new URL('../public/track/' + f, import.meta.url))
const meta = JSON.parse(rd('surface.json').toString()); const bin = rd('surface.bin')
const tr = new TrackSurface(meta, new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2))
const { N, ND, D0, DSTEP } = meta, T = (i: number, j: number) => tr.cell(((i % N) + N) % N, j) & 7
function find(type: number, len: number): [number, number] | null {
  for (let i = 0; i < N; i += 7) for (let j = type === 1 ? (ND - 1) / 2 - 8 : 8; j < (type === 1 ? (ND - 1) / 2 + 9 : ND - 8); j += 2) {
    let ok = true
    for (let k = 0; k < len && ok; k += 2) for (let o = -8; o <= 8 && ok; o += 4) ok = T(i + k, j + o) === type
    if (ok) return [i * meta.ds, D0 + j * DSTEP]
  }
  return null
}
let fail = 0
for (const [type, name, lo, hi] of [[5, "gravier", 0.8, 1.3], [4, "herbe", 0.3, 0.9], [1, "asphalte", 0.1, 1.2]] as const) {
  const at = find(type, 90)
  if (!at) { console.log('pas de bande', name); continue }
  const car = new Vehicle(tr); car.placeAt(at[0], at[1], 150 / 3.6)
  const v0 = 150 / 3.6; let t = 0, dist = 0, sinkMax = 0
  while (t < 1.5) { car.step(1 / 240, { throttle: 0, brake: 0, steer: 0 }); t += 1 / 240; dist += car.speed / 240; sinkMax = Math.max(sinkMax, ...car.wheels.map(w => w.sink ?? 0)) }
  const g = (v0 - car.speed) / t / 9.81
  const ok = g >= lo && g <= hi
  if (!ok) fail++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} (s=${at[0].toFixed(0)} d=${at[1].toFixed(1)}) : 150 → ${(car.speed * 3.6).toFixed(0)} km/h en 1,5 s, ${dist.toFixed(0)} m, décélération moyenne ${g.toFixed(2)} g (réf. ${lo}–${hi}), enfoncement max ${(sinkMax * 100).toFixed(1)} cm`)
}
console.log(fail ? fail + ' échec(s)' : 'tous les tests surface passent'); if (fail) process.exitCode = 1
