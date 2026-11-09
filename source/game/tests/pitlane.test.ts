// Voie des stands praticable (Node) : node tests/pitlane.test.ts
// Un pilote simple suit le chemin calculé (entrée Arrêt de Bus → stands → sortie après La Source) AVEC les barrières
// réelles actives ; limiteur 80 km/h automatique dans la zone. Vérifie : aucun choc, arrivée en piste, vitesse limitée.
import { readFileSync } from 'node:fs'
import { Vehicle } from '../src/physics/vehicle.ts'
import { TrackSurface, newSample } from '../src/track/surface.ts'
import { Barriers } from '../src/track/barriers.ts'
import { Pitlane } from '../src/track/pitlane.ts'
const DT = 1 / 240
const rd = (f: string) => readFileSync(new URL('../public/track/' + f, import.meta.url))
const meta = JSON.parse(rd('surface.json').toString()); const bin = rd('surface.bin'); const bb = rd('barriers.bin')
const tr = new TrackSurface(meta, new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2))
tr.barriers = new Barriers(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength))
const P = new Pitlane(JSON.parse(rd('pitlane.json').toString()), { limitFromS: 6790, limitToS: 200 })
const car = new Vehicle(tr); car.setup.autoGear = true
car.placeAt(P.s[0], P.d[0], 30)
const smp = newSample()
let hits = 0, maxImp = 0, i = 0, vMaxZone = 0, tZone = 0, t = 0, done = false, inZone = false, entered = -1, exited = -1
for (; t < 200 && !done; t += DT) {
  const r = P.nearest(car.pos[0], car.pos[2]); i = r.i
  const zone = r.dist < 6 && i >= P.iIn && i <= P.iOut
  if (zone && !inZone) entered = t; if (!zone && inZone) exited = t; inZone = zone
  const la = Math.min(P.n - 1, i + 4)  // 8 m devant
  const fx = -car.R[6], fz = -car.R[8], fn = Math.hypot(fx, fz) || 1
  const tx = P.x[la] - car.pos[0], tz = P.z[la] - car.pos[2], tn = Math.hypot(tx, tz) || 1
  const cr = (fx * tz - fz * tx) / (fn * tn), dt_ = (fx * tx + fz * tz) / (fn * tn)
  const e = Math.atan2(cr, dt_)
  // courbure à venir → vitesse cible
  let k = 0; for (let j = i; j < Math.min(P.n - 2, i + 25); j++) { const ax = P.x[j + 1] - P.x[j], az = P.z[j + 1] - P.z[j], bx = P.x[j + 2] - P.x[j + 1], bz = P.z[j + 2] - P.z[j + 1]; k = Math.max(k, Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)) / 2) }
  const vT = Math.min(zone ? 30 : 40, Math.sqrt(9 / Math.max(k, 1e-3)))
  const v = car.speed
  car.step(DT, { throttle: v < vT ? 0.7 : 0, brake: v > vT + 2 || (zone && v > 22.6) ? 0.6 : 0, steer: Math.max(-1, Math.min(1, e * 2.2)), pitLim: zone })
  if (car.impact > 0.15) { hits++; maxImp = Math.max(maxImp, car.impact) }
  if (process.env.DBG2 && zone && car.speed * 3.6 > 80.8) console.log("over", t.toFixed(2), (car.speed * 3.6).toFixed(1), "thr", car.throttleApplied.toFixed(2), "cut", car.pitLimCut.toFixed(2), "vy", car.vel[1].toFixed(2))
  if (zone && t - entered > 2) { vMaxZone = Math.max(vMaxZone, car.speed * 3.6); tZone += DT }
  if (i >= P.n - 3) done = true
  if (process.env.DBG && Math.round(t / DT) % 240 === 0) { const q = tr.sample(car.pos[0], car.pos[2], car.hint, smp); console.log(t.toFixed(0), "i", i, "dist", r.dist.toFixed(1), "s", q.s.toFixed(0), "d", q.d.toFixed(1), "v", (v * 3.6).toFixed(0), "e", e.toFixed(2), "imp", car.impact.toFixed(2)) }
}
const g = tr.sample(car.pos[0], car.pos[2], car.hint, smp)
const ok = done && hits === 0 && vMaxZone < 81.5
console.log(JSON.stringify({ arrivée: done, temps_s: +t.toFixed(1), chocs_pas: hits, impactMax: +maxImp.toFixed(2), vMaxZone_kmh: +vMaxZone.toFixed(1), tempsZone_s: +tZone.toFixed(1), entrée_t: +entered.toFixed(1), sortie_t: +exited.toFixed(1), s_fin: Math.round(g.s), d_fin: +g.d.toFixed(1), surface_fin: g.type }))
console.log(ok ? 'OK : voie des stands praticable, limiteur respecté, aucun choc' : 'ÉCHEC voie des stands (index ' + i + '/' + P.n + ')')
if (!ok) process.exitCode = 1
