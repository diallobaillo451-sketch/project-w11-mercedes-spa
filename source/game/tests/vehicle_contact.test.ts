// Impulsions sur la voiture physique : cohérence des signes et de la masse effective (contacts entre voitures) — npx tsx tests/vehicle_contact.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TrackSurface } from '../src/track/surface.ts'
import { Vehicle } from '../src/physics/vehicle.ts'
const rd = (f: string) => readFileSync(new URL('../public/track/' + f, import.meta.url))
const meta = JSON.parse(rd('surface.json').toString()), bin = rd('surface.bin')
const t = new TrackSurface(meta, new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2))
const v = new Vehicle(t); v.placeAt(500, 1, 30, 0.3)
const pv = (rx: number, rz: number) => v.pointVel(rx, rz, [0, 0]), j = 500
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
for (let k = 0; k < 200; k++) {
  const a = rnd() * 2 * Math.PI, nx = Math.cos(a), nz = Math.sin(a), rx = (rnd() - 0.5) * 2, rz = (rnd() - 0.5) * 5.4
  const before = pv(rx, rz), im = v.invMassAt(nx, nz, rx, rz)
  v.applyImpulse(rx, rz, j * nx, j * nz)
  const after = pv(rx, rz), dvn = (after[0] - before[0]) * nx + (after[1] - before[1]) * nz
  assert.ok(Math.abs(dvn - j * im) < 1e-6 * Math.max(1, j * im), `Δv·n = ${dvn} ≠ j·invMass = ${j * im}`)
  v.applyImpulse(rx, rz, -j * nx, -j * nz) // on annule
}
// une impulsion au CdG ne fait pas tourner ; hors CdG, elle crée un lacet du bon signe (frappe à droite de l'avant → lacet qui éloigne l'avant)
const w0 = v.wb[1], fw = -v.R[6], fz2 = -v.R[8] // avant (monde)
v.applyImpulse(0, 0, 100, 0); assert.ok(Math.abs(v.wb[1] - w0) < 1e-12)
const J = 400, rx = fw * 2.5, rz = fz2 * 2.5 // point à 2,5 m devant le CdG
const yawBefore = v.wb[1]; v.applyImpulse(rx, rz, J, 0); const dyaw = v.wb[1] - yawBefore
assert.ok(Math.abs(dyaw) > 0.1 && Math.sign(dyaw) === Math.sign(rz * J), 'signe du couple')
console.log('vehicle_contact.test.ts : OK  (Δω lacet pour 400 N·s à 2,5 m =', dyaw.toFixed(3), 'rad/s)')
