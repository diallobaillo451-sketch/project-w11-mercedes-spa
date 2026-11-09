// Extrait chaque arbre (composante connexe des maillages trees1/trees2 de la piste) → public/track/trees.json
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import fs from 'node:fs'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const out = [], stats = {}
for (const f of fs.readdirSync('public/assets/spa').filter(f => /^(t\d\d|base)\.gltf$/.test(f))) {
  const doc = await io.read('public/assets/spa/' + f)
  for (const n of doc.getRoot().listNodes()) { const nm = n.getName(); const m = /^(trees1|trees2|bushesB)/.exec(nm); if (!m || !n.getMesh()) continue
    const W = n.getWorldMatrix()
    for (const p of n.getMesh().listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices().getArray(), N = pos.getCount(), P = new Float32Array(N * 3), v = [0, 0, 0]
      for (let i = 0; i < N; i++) { pos.getElement(i, v); P[i*3] = W[0]*v[0]+W[4]*v[1]+W[8]*v[2]+W[12]; P[i*3+1] = W[1]*v[0]+W[5]*v[1]+W[9]*v[2]+W[13]; P[i*3+2] = W[2]*v[0]+W[6]*v[1]+W[10]*v[2]+W[14] }
      // soudure par position (cartes croisées d'un même arbre partagent souvent le pied) + union par triangle
      const par = new Int32Array(N).map((_, i) => i), find = a => { while (par[a] !== a) a = par[a] = par[par[a]]; return a }, uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b }
      for (let t = 0; t < idx.length; t += 3) { uni(idx[t], idx[t+1]); uni(idx[t], idx[t+2]) }
      const key = new Map(); for (let i = 0; i < N; i++) { const k = Math.round(P[i*3]*2)+','+Math.round(P[i*3+2]*2); const o = key.get(k); if (o != null && Math.abs(P[o*3+1]-P[i*3+1]) < 0.6) uni(i, o); else key.set(k, i) }
      const C = new Map()
      for (let i = 0; i < N; i++) { const r = find(i); let c = C.get(r); if (!c) C.set(r, c = [1e9,1e9,1e9,-1e9,-1e9,-1e9]); for (let k = 0; k < 3; k++) { c[k] = Math.min(c[k], P[i*3+k]); c[k+3] = Math.max(c[k+3], P[i*3+k]) } }
      for (const c of C.values()) { const h = c[4]-c[1], w = Math.max(c[3]-c[0], c[5]-c[2]); if (h < 1) continue
        out.push([m[1], +((c[0]+c[3])/2).toFixed(2), +c[1].toFixed(2), +((c[2]+c[5])/2).toFixed(2), +h.toFixed(2), +w.toFixed(2), f]) }
      stats[m[1]] = (stats[m[1]] || 0) + C.size
    } } }
const hs = t => out.filter(o => o[0] === t).map(o => o[4]).sort((a, b) => a - b), q = (a, f) => a[Math.floor(a.length * f)]
for (const t of ['trees1', 'trees2', 'bushesB']) { const a = hs(t); console.log(t, 'n', a.length, 'h p10/50/90', q(a, .1), q(a, .5), q(a, .9), 'comps', stats[t]) }
const ws = out.filter(o => o[0] !== 'bushesB').map(o => o[5]).sort((a, b) => a - b); console.log('w p10/50/90', q(ws, .1), q(ws, .5), q(ws, .9))
fs.writeFileSync('/tmp/trees_raw.json', JSON.stringify(out))
