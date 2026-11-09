import { readFileSync } from 'node:fs'
import { TrackSurface } from '/workspace/w11/game/src/track/surface.ts'
import { buildRacingLine } from '/workspace/w11/game/src/track/racingLine.ts'
const meta = JSON.parse(readFileSync('/workspace/w11/game/public/track/surface.json', 'utf8'))
const buf = readFileSync('/workspace/w11/game/public/track/surface.bin')
const t = new TrackSurface(meta, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2))
let t0=Date.now(); const L = buildRacingLine(t, 1600, 1.0); console.log('ms', Date.now()-t0)
for (let i = 0; i < L.N; i += 100) console.log(i, L.e[i].toFixed(1), (L.v[i]*3.6).toFixed(0), (1/Math.max(1e-4,Math.abs(L.k[i]))).toFixed(0))
let tl=0; for (let i=0;i<L.N;i++) tl += L.ds / Math.max(L.v[i],1); console.log('QSS lap', tl.toFixed(2))
{ let a=0,b=0,c=0; for (let i=0;i<L.N;i++){ const dt=L.ds/Math.max(L.v[i],1); const s=i*L.ds; if(s<2050)a+=dt; else if(s<5000)b+=dt; else c+=dt } console.log('S1',a.toFixed(1),'S2',b.toFixed(1),'S3',c.toFixed(1),'vmax',(Math.max(...L.v)*3.6).toFixed(0)) }
{ const v=L.v; for (let i=0;i<L.N;i++){ const a=v[(i-1+L.N)%L.N], b=v[(i+1)%L.N]; if (v[i]<=a && v[i]<b && v[i]*3.6<300) { let mn=true; for(let k=-40;k<=40;k++) if (v[(i+k+L.N)%L.N]<v[i]) mn=false; if(mn) console.log('min', i, (v[i]*3.6).toFixed(0), 'R', (1/Math.abs(L.k[i])).toFixed(0)) } } }
