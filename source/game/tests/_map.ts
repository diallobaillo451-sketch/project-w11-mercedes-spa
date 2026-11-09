import { readFileSync } from 'node:fs'
const meta = JSON.parse(readFileSync('public/track/surface.json', 'utf8'))
const buf = readFileSync('public/track/surface.bin'); const g = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
const ch = '.akgGs?#'
const a = Number(process.argv[2]), b = Number(process.argv[3]), st = Number(process.argv[4] ?? 5)
for (let i = a; i < b; i += st) { let l = ''; for (let j = 0; j < meta.ND; j += 2) { const v = g[i * meta.ND + j]; l += ch[v & 7] ?? 'x' } console.log(String(i).padStart(5), l, meta.wl[i].toFixed(1), meta.wr[i].toFixed(1), meta.wallL[i].toFixed(1), meta.wallR[i].toFixed(1)) }
