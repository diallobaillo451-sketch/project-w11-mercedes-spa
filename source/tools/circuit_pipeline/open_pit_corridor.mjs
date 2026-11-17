#!/usr/bin/env node
/** Ouvre dans la grille de surface les couloirs d'entrée et de sortie de la voie des stands (pitlane.json).
 *  Le modèle 3D ne relie pas toujours la piste à la voie des stands par de l'asphalte continu (murets, herbe) :
 *  les cellules non roulables à moins de 3,5 m du chemin passent en asphalte (type 1).
 *  Les limites virtuelles de collision sont étendues localement jusqu'au chemin, jamais au-delà de 44 m.
 *  Usage : node open_pit_corridor.mjs <dossier-piste> [rayon-m] (surface.json, surface.bin, pitlane.json). */
import fs from 'node:fs'
import path from 'node:path'
const dir = process.argv[2]; const R = Number(process.argv[3] ?? 3.5)
if (!dir) { console.error('usage: node open_pit_corridor.mjs <dossier-piste> [rayon-m]'); process.exit(2) }
const metaPath = path.join(dir, 'surface.json')
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
const pit = JSON.parse(fs.readFileSync(path.join(dir, 'pitlane.json'), 'utf8'))
const binPath = path.join(dir, 'surface.bin'); const raw = fs.readFileSync(binPath)
const N = meta.N, ND = meta.ND, D0 = meta.D0, DS = meta.DSTEP
const g = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
if (g.length !== N * ND) { console.error('surface.bin : taille inattendue'); process.exit(1) }
if (!Number.isFinite(meta.ds) || !Array.isArray(meta.wallL) || !Array.isArray(meta.wallR) ||
    meta.wallL.length !== N || meta.wallR.length !== N || !Array.isArray(pit.s) || !Array.isArray(pit.d) || pit.s.length !== pit.d.length) {
  console.error('surface.json / pitlane.json : métadonnées incompatibles'); process.exit(1)
}
const type = i => g[i] & 7, roll = t => t === 1 || t === 2 || t === 3
const n = pit.s.length
// zones à ouvrir : rampes (la voie principale est déjà en asphalte) + tout point dont la cellule n'est pas roulable
const dIn = pit.d.findIndex(d => Math.abs(d) >= 10.5), dOut = n - 1 - [...pit.d].reverse().findIndex(d => Math.abs(d) >= 10.5)
const zone = k => k <= dIn + 12 || k >= dOut - 12
let carved = 0
for (let k = 0; k < n - 1; k++) {
  const s0 = pit.s[k], s1 = pit.s[k + 1]; let ds = s1 - s0; if (ds > N / 2) ds -= N; if (ds < -N / 2) ds += N
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(ds), Math.abs(pit.d[k + 1] - pit.d[k])) / 0.5))
  for (let q = 0; q <= steps; q++) {
    const f = q / steps, s = s0 + ds * f, d = pit.d[k] + (pit.d[k + 1] - pit.d[k]) * f
    const ic = ((Math.round(s) % N) + N) % N, jc = Math.round((d - D0) / DS)
    const here = jc >= 0 && jc < ND ? type(ic * ND + jc) : 1
    if (!zone(k) && roll(here)) continue
    const r = zone(k) ? R : 1.5
    for (let di = -Math.ceil(r); di <= Math.ceil(r); di++) {
      const i = (((ic + di) % N) + N) % N
      for (let dj = Math.floor(-r / DS); dj <= Math.ceil(r / DS); dj++) {
        const j = jc + dj; if (j < 0 || j >= ND) continue
        const idx = i * ND + j; if (!roll(type(idx))) { g[idx] = (g[idx] & ~7) | 1; carved++ }
      }
    }
  }
}
// Le corridor est à distance latérale de la ligne centrale : lever le mur virtuel uniquement sous le chemin.
// Trois stations de marge couvrent l'empattement et l'espacement des points du chemin (≈2 m).
let wallsOpened = 0
for (let k = 0; k < n; k++) {
  const d = Number(pit.d[k]); if (Math.abs(d) < 2.5) continue
  const want = Math.min(44, Math.abs(d) + 3.5)
  const side = d > 0 ? meta.wallR : meta.wallL
  const ic = ((Math.round(Number(pit.s[k]) / meta.ds) % N) + N) % N
  for (let di = -3; di <= 3; di++) {
    const i = (ic + di + N) % N
    if (side[i] < want) { side[i] = want; wallsOpened++ }
  }
}
fs.writeFileSync(binPath, Buffer.from(g.buffer, g.byteOffset, g.byteLength))
fs.writeFileSync(metaPath, JSON.stringify(meta))
console.log(`couloir des stands : ${carved} cellules ouvertes, ${wallsOpened} limites de collision élargies (rayon ${R} m)`)
