import { readFileSync } from 'node:fs'
import { TrackSurface } from '/workspace/w11/game/src/track/surface.ts'
import { buildRacingLine } from '/workspace/w11/game/src/track/racingLine.ts'
const meta = JSON.parse(readFileSync('/workspace/w11/game/public/track/surface.json', 'utf8'))
const buf = readFileSync('/workspace/w11/game/public/track/surface.bin')
const t = new TrackSurface(meta, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2))
const L = buildRacingLine(t, 1600, 1.0)
const a=Number(process.argv[2]), b=Number(process.argv[3])
for (let i=a;i<b;i+=Number(process.argv[4]??10)){ const sm=(t as any); console.log(i,'e',L.e[i].toFixed(2),'v',(L.v[i]*3.6).toFixed(0),'R',(1/Math.max(1e-4,Math.abs(L.k[i]))).toFixed(0), 'H', sm.H?.[i]?.toFixed(2), 'wlR', sm.wlR[i].toFixed(1), 'wrR', sm.wrR[i].toFixed(1), 'WL', sm.WL[i].toFixed(1), 'WR', sm.WR[i].toFixed(1)) }
