// Contacts voiture ↔ voiture : géométrie (SAT) et impulsion — node tests/contact.test.ts
import assert from 'node:assert/strict'
import { boxHit, solveImpulse, HL, HW, type Box } from '../src/race/contact.ts'
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)
const A: Box = { x: 0, z: 0, fx: 0, fz: 1 }
// 1) côte à côte, 1,5 m entre centres : recouvrement latéral 2·HW − 1,5
{ const h = boxHit(A, { x: 1.5, z: 0, fx: 0, fz: 1 })!; assert.ok(h); near(h.depth, 2 * HW - 1.5); near(h.nx, 1); near(h.nz, 0); near(h.px, (1.5 + (-HW + 1.5 - HW + HW + HW)) / 2 - 0.0, 1) }
// 2) l'une derrière l'autre, 5 m entre centres : recouvrement longitudinal 2·HL − 5, normale le long de l'axe
{ const h = boxHit(A, { x: 0, z: 5, fx: 0, fz: 1 })!; near(h.depth, 2 * HL - 5); near(h.nx, 0); near(h.nz, 1) }
// 3) pas de contact
assert.equal(boxHit(A, { x: 0, z: 2 * HL + 0.01, fx: 0, fz: 1 }), null)
assert.equal(boxHit(A, { x: 2 * HW + 0.01, z: 0, fx: 0, fz: 1 }), null)
// 4) symétrie : mêmes profondeurs, normales opposées, quel que soit l'ordre ou le cap
for (const [x, z, a] of [[1.2, 3, 0.4], [-1.6, -4, -0.7], [0.3, 4.9, 1.3], [2.5, 1, 2.2], [0, 0.5, 3]] as const) {
  const B: Box = { x, z, fx: Math.sin(a), fz: Math.cos(a) }, ab = boxHit(A, B), ba = boxHit(B, A)
  assert.equal(!!ab, !!ba); if (ab && ba) { near(ab.depth, ba.depth, 1e-9); near(ab.nx, -ba.nx, 1e-9); near(ab.nz, -ba.nz, 1e-9) }
}
// 5) en travers (T) : contact détecté, normale unitaire, point de contact dans les deux rectangles (≈)
{ const B: Box = { x: 2.2, z: 0, fx: 1, fz: 0 }, h = boxHit(A, B)!; assert.ok(h); near(Math.hypot(h.nx, h.nz), 1, 1e-9); assert.ok(h.depth > 0 && h.depth < 2.5); assert.ok(Math.abs(h.px) < HW + 1e-6 && Math.abs(h.pz) < HL) }
// 6) déplacer B de `depth` le long de la normale supprime le recouvrement (à quelques mm près)
for (const [x, z, a] of [[1.5, 0, 0], [0.5, 4.8, 0.2], [1.7, 2, 0.5], [-1.2, -3, -0.3]] as const) {
  const B: Box = { x, z, fx: Math.sin(a), fz: Math.cos(a) }, h = boxHit(A, B)!
  const B2: Box = { ...B, x: B.x + h.nx * (h.depth + 0.002), z: B.z + h.nz * (h.depth + 0.002) }; assert.equal(boxHit(A, B2), null)
}
// 7) impulsion : deux masses égales (800 kg), rapprochement de 10 m/s → vitesse de séparation = e × 10 ; momentum conservé
{ const m = 800, r = solveImpulse(1, 0, -10, 0, 1 / m, 1 / m)!; near(r.j * 2 / m - 10, 1, 1e-9) // Δ(vn) = j (iA + iB) ; vn' = −10 + 11 = +1 = −e·vn
  assert.equal(solveImpulse(1, 0, 3, 0, 1 / m, 1 / m), null) } // elles s'écartent déjà
// 8) frottement : borné par μ·j
{ const r = solveImpulse(1, 0, -5, 20, 1 / 800, 1 / 800)!; assert.ok(Math.abs(r.jt) <= 0.3 * r.j + 1e-9); assert.ok(r.jt < 0) }
console.log('contact.test.ts : OK')
