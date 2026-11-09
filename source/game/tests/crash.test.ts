// Sorties de piste et chocs à haute vitesse (Node) : node tests/crash.test.ts
// Compare murs virtuels (ancien) et barrières réelles (nouveau) : hauteur max au-dessus du sol, vitesse verticale,
// retournement, traversée de barrière (trajectoire du CdG qui coupe un segment), vitesse finale.
import { readFileSync } from 'node:fs'
import { Vehicle } from '../src/physics/vehicle.ts'
import { TrackSurface, newSample } from '../src/track/surface.ts'
import { Barriers } from '../src/track/barriers.ts'
const DT = 1 / 240
const meta = JSON.parse(readFileSync(new URL('../public/track/surface.json', import.meta.url), 'utf8'))
const bin = readFileSync(new URL('../public/track/surface.bin', import.meta.url))
const bb = readFileSync(new URL('../public/track/barriers.bin', import.meta.url))
const mk = (withB: boolean) => { const t = new TrackSurface(meta, new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2)); if (withB) t.barriers = new Barriers(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength)); return t }
const tracks = { ancien: mk(false), nouveau: mk(true) }
const B = tracks.nouveau.barriers!
const crosses = (ax: number, az: number, bx: number, bz: number) => {
  const [a, b] = B.cell(bx, bz)
  for (let j = a; j < b; j++) { const i = B.idx[j] * 4, x1 = B.S[i], z1 = B.S[i + 1], x2 = B.S[i + 2], z2 = B.S[i + 3]
    const d1 = (bx - ax) * (z1 - az) - (bz - az) * (x1 - ax), d2 = (bx - ax) * (z2 - az) - (bz - az) * (x2 - ax), d3 = (x2 - x1) * (az - z1) - (z2 - z1) * (ax - x1), d4 = (x2 - x1) * (bz - z1) - (z2 - z1) * (bx - x1)
    if (d1 * d2 < 0 && d3 * d4 < 0) return true }
  return false
}
const S0 = [[880, 'Eau Rouge'], [1000, 'Raidillon'], [2250, 'fin Kemmel'], [3500, 'Pouhon'], [5650, 'Blanchimont'], [6750, 'Arrêt de Bus'], [300, 'La Source']] as const
const S = process.env.ONLY ? [[+process.env.ONLY, 'dbg']] as const : S0
const out: Record<string, unknown>[] = []
let fail = 0
for (const [s, name] of S) for (const side of [1, -1]) for (const v of [85, 60]) {
  const row: Record<string, unknown> = { lieu: name, s, cote: side > 0 ? 'droite' : 'gauche', kmh: v * 3.6 }
  for (const [lbl, tr] of Object.entries(tracks)) {
    const car = new Vehicle(tr); car.setup.autoGear = true; car.placeAt(s, 0, v)
    const yaw = side * 0.42, cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), [qx, qy, qz, qw] = car.q
    car.q = [cy * qx + sy * qz * 0 + 0 * qw + (sy * qz - 0), 0, 0, 0] // remplacé ci-dessous
    // q = qYaw ⊗ q
    car.q = [cy * qx + sy * qz, cy * qy + sy * qw, cy * qz - sy * qx, cy * qw - sy * qy]
    const c = Math.cos(yaw), sn = Math.sin(yaw), vx = car.vel[0], vz = car.vel[2]; car.vel[0] = c * vx + sn * vz; car.vel[2] = -sn * vx + c * vz
    let hMax = 0, vyMax = 0, flips = 0, through = 0, hits = 0, px = car.pos[0], pz = car.pos[2]
    const smp = newSample()
    for (let i = 0; i < 240 * 4; i++) {
      car.step(DT, { throttle: 0.6, brake: 0, steer: 0 })
      const g = tr.sample(car.pos[0], car.pos[2], car.hint, smp)
      hMax = Math.max(hMax, car.pos[1] - g.h - car.cg[1]); vyMax = Math.max(vyMax, car.vel[1])
      if (car.R[4] < 0.3) flips++
      if (crosses(px, pz, car.pos[0], car.pos[2])) through++
      if (car.impact > 0.3) hits++
      if (process.env.ONLY && lbl === 'nouveau' && i % 12 === 0 && side > 0 && v === 85) console.log((i/240).toFixed(2), 'h', (car.pos[1] - g.h - car.cg[1]).toFixed(2), 'd', g.d.toFixed(1), 's', g.s.toFixed(0), 'type', g.type, 'vy', car.vel[1].toFixed(1), 'v', (car.speed*3.6).toFixed(0), 'contact', car.wheels.map(w=>w.contact?1:0).join(''), 'ny', g.ny.toFixed(2))
      px = car.pos[0]; pz = car.pos[2]
    }
    row[lbl] = { hMax: +hMax.toFixed(2), vyMax: +vyMax.toFixed(1), flips, traversées: through, chocs: hits, vFin: +(car.speed * 3.6).toFixed(0), dégâts: +car.damage.total.toFixed(2) }
  }
  const n = row.nouveau as { hMax: number; flips: number }
  if (n.hMax > 1.0 || n.flips > 0) fail++
  out.push(row); console.log(JSON.stringify(row))
}
console.log(fail ? `ÉCHEC : ${fail} scénarios avec envol > 1 m ou retournement` : 'OK : aucun envol > 1 m, aucun retournement (barrières réelles)')
