#!/usr/bin/env node
/** Transforme crowd_rows.json (rangées de gradins : x0 z0 dx dz en dm, y en cm, repère de jeu) en crowd.bin lu par render/crowd.ts :
 *  uint32 n, puis n × float32 (x, y, z, lacet). Une place tous les `spacing` m, taux d'occupation déterministe,
 *  personnes tournées vers le point le plus proche de la ligne centrale (surface.json) : le jeu oriente par (π − lacet),
 *  le visage est (sin lacet, −cos lacet), donc lacet = atan2(vers_x, −vers_z).
 *  Usage : node expand_crowd_rows.mjs <crowd_rows.json> <surface.json> <crowd.bin> */
import fs from 'node:fs'
const [, , rowsPath, surfPath, outPath] = process.argv
if (!rowsPath || !surfPath || !outPath) { console.error('usage: expand_crowd_rows.mjs <crowd_rows.json> <surface.json> <crowd.bin>'); process.exit(2) }
const { rows, spacing = 0.52, occupancy = 72 } = JSON.parse(fs.readFileSync(rowsPath, 'utf8'))
const { cx, cz } = JSON.parse(fs.readFileSync(surfPath, 'utf8'))
// grille spatiale de la ligne centrale (cellules de 20 m)
const CELL = 20, grid = new Map()
for (let i = 0; i < cx.length; i++) { const k = Math.floor(cx[i] / CELL) + ',' + Math.floor(cz[i] / CELL); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i) }
function nearest(x, z) {
  for (let r = 1; r <= 40; r++) {
    let best = -1, bd = Infinity; const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL)
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== r && r > 1) continue
      const l = grid.get((gx + a) + ',' + (gz + b)); if (!l) continue
      for (const i of l) { const d = (cx[i] - x) ** 2 + (cz[i] - z) ** 2; if (d < bd) { bd = d; best = i } }
    }
    if (best >= 0 && Math.sqrt(bd) <= (r - 1) * CELL + CELL * 0.99) return best
  }
  return -1
}
const out = []
let id = 0
for (const [a0, b0, da, db, yc] of rows) {
  const x0 = a0 / 10, z0 = b0 / 10, x1 = x0 + da / 10, z1 = z0 + db / 10, y = yc / 100
  const L = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.floor(L / spacing))
  for (let k = 0; k <= n; k++, id++) {
    const h = (Math.imul(id + 1, 2654435761) >>> 0) % 100; if (h >= occupancy) continue
    const f = n ? k / n : 0, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f
    const j = nearest(x, z); if (j < 0) continue
    const tx = cx[j] - x, tz = cz[j] - z, tn = Math.hypot(tx, tz) || 1
    out.push(x, y, z, Math.atan2(tx / tn, -tz / tn))
  }
}
const n = out.length / 4, buf = Buffer.alloc(4 + out.length * 4)
buf.writeUInt32LE(n, 0); for (let i = 0; i < out.length; i++) buf.writeFloatLE(out[i], 4 + i * 4)
fs.writeFileSync(outPath, buf)
console.log(`public : ${n} personnes, ${(buf.length / 1024).toFixed(1)} Ko`)
