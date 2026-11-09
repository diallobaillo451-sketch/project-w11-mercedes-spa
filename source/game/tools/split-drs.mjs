// Sépare le volet supérieur d'aileron arrière (DRS) dans les GLB optimisés, sans ré-optimiser depuis le brut.
// Source de vérité : assets-work/drs_flap_tris.json, écrit par blender/scripts/s1_drs_flap.py (séparation faite et
// vérifiée dans Blender, étape c4). On applique la même sélection : un triangle du GLB passe dans le volet si ses
// 3 sommets (repère monde glTF) sont à < TOL d'un sommet du volet Blender.
// Résultat : nœud « DRS_pivot » (au bord de fuite, axe x) → nœud « DRS_flap » (maillages du volet, positions float).
// Originaux conservés : assets-work/glb_avant_drs/.
// usage : node tools/split-drs.mjs [high|low ...]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import fs from 'node:fs'; import path from 'node:path'
const W = '/workspace/w11', TOL = Number(process.env.TOL ?? 0.001)
const J = JSON.parse(fs.readFileSync(W + '/assets-work/drs_flap_tris.json', 'utf8'))
const key = (x, y, z) => `${Math.round(x / TOL)},${Math.round(y / TOL)},${Math.round(z / TOL)}`
const H = new Set(); for (const t of J.tris) for (const [x, y, z] of t) H.add(key(x, y, z))
const near = (x, y, z) => { const a = Math.round(x / TOL), b = Math.round(y / TOL), c = Math.round(z / TOL)
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (H.has(`${a + i},${b + j},${c + k}`)) return true; return false }
// boîte englobante du volet (+5 mm) : garde-fou contre des sommets d'autres pièces qui tomberaient dans la grille
const bb = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]]; for (const t of J.tris) for (const v of t) for (let i = 0; i < 3; i++) { bb[0][i] = Math.min(bb[0][i], v[i] - 0.005); bb[1][i] = Math.max(bb[1][i], v[i] + 0.005) }
const inBB = (x, y, z) => x >= bb[0][0] && x <= bb[1][0] && y >= bb[0][1] && y <= bb[1][1] && z >= bb[0][2] && z <= bb[1][2]
const mul = (m, x, y, z, w = 1) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w]
await MeshoptDecoder.ready; await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const report = {}
for (const q of (process.argv.slice(2).length ? process.argv.slice(2) : ['high', 'low'])) {
  const f = `${W}/game/public/assets/w11_lh2020_${q}.glb`, bak = `${W}/assets-work/glb_avant_drs/w11_lh2020_${q}.glb`
  fs.mkdirSync(path.dirname(bak), { recursive: true }); if (!fs.existsSync(bak)) fs.copyFileSync(f, bak)
  const doc = await io.read(bak), root = doc.getRoot(), buf = root.listBuffers()[0]
  if (root.listNodes().some(n => n.getName() === 'DRS_pivot')) throw new Error('déjà séparé')
  const scene = root.listScenes()[0], top = scene.listChildren()[0] // W11_root
  const topInv = (() => { const m = top.getWorldMatrix(); const T = new Float64Array(16); // inverse affine
    const a = m, det = a[0] * (a[5] * a[10] - a[9] * a[6]) - a[4] * (a[1] * a[10] - a[9] * a[2]) + a[8] * (a[1] * a[6] - a[5] * a[2])
    const r = [(a[5] * a[10] - a[6] * a[9]) / det, -(a[1] * a[10] - a[2] * a[9]) / det, (a[1] * a[6] - a[2] * a[5]) / det,
      -(a[4] * a[10] - a[6] * a[8]) / det, (a[0] * a[10] - a[2] * a[8]) / det, -(a[0] * a[6] - a[2] * a[4]) / det,
      (a[4] * a[9] - a[5] * a[8]) / det, -(a[0] * a[9] - a[1] * a[8]) / det, (a[0] * a[5] - a[1] * a[4]) / det]
    T.set([r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0]); const t = mul(T, a[12], a[13], a[14], 1); T[12] = -t[0]; T[13] = -t[1]; T[14] = -t[2]; T[15] = 1; return T })()
  const P = J.pivot_gltf, Pl = mul(topInv, P[0], P[1], P[2])
  const pivot = doc.createNode('DRS_pivot').setTranslation(Pl); top.addChild(pivot)
  const flapNode = doc.createNode('DRS_flap').setTranslation([-Pl[0], -Pl[1], -Pl[2]]); pivot.addChild(flapNode)
  const flapMesh = doc.createMesh('DRS_flap'); flapNode.setMesh(flapMesh)
  let moved = 0, total = 0; const perMesh = {}
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh || node === flapNode) continue
    const M = node.getWorldMatrix(), L = Array.from({ length: 16 }); // monde → local W11_root
    for (let c = 0; c < 4; c++) { const v = mul(topInv, M[c * 4], M[c * 4 + 1], M[c * 4 + 2], c === 3 ? 1 : 0); L[c * 4] = v[0]; L[c * 4 + 1] = v[1]; L[c * 4 + 2] = v[2]; L[c * 4 + 3] = c === 3 ? 1 : 0 }
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue
      const pos = prim.getAttribute('POSITION'), n = pos.getCount(); let idx = prim.getIndices()
      const ia = idx ? idx.getArray() : Uint32Array.from({ length: n }, (_, i) => i)
      const ok = new Uint8Array(n), wp = new Float32Array(n * 3), e = [0, 0, 0]
      for (let i = 0; i < n; i++) { pos.getElement(i, e); const w = mul(M, e[0], e[1], e[2]); wp.set(w, i * 3); ok[i] = inBB(...w) && near(...w) ? 1 : 0 }
      const keep = [], take = []
      for (let t = 0; t < ia.length; t += 3) (ok[ia[t]] && ok[ia[t + 1]] && ok[ia[t + 2]] ? take : keep).push(ia[t], ia[t + 1], ia[t + 2])
      total += ia.length / 3; if (!take.length) continue
      moved += take.length / 3; perMesh[mesh.getName()] = (perMesh[mesh.getName()] ?? 0) + take.length / 3
      // nouveau primitive du volet : sommets réindexés, attributs en float (repère local W11_root)
      const remap = new Map(), list = []; const ni = take.map(v => { if (!remap.has(v)) { remap.set(v, list.length); list.push(v) } return remap.get(v) })
      const np = doc.createPrimitive().setMaterial(prim.getMaterial()).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(ni)).setBuffer(buf))
      for (const sem of prim.listSemantics()) {
        const a = prim.getAttribute(sem), sz = a.getElementSize(), out = new Float32Array(list.length * sz), el = new Array(sz).fill(0)
        list.forEach((v, k) => { a.getElement(v, el)
          if (sem === 'POSITION') out.set(mul(L, el[0], el[1], el[2]), k * 3)
          else if (sem === 'NORMAL' || sem === 'TANGENT') { const d = mul(L, el[0], el[1], el[2], 0), l = Math.hypot(...d) || 1; out.set([d[0] / l, d[1] / l, d[2] / l], k * sz); if (sz === 4) out[k * 4 + 3] = el[3] }
          else out.set(el, k * sz) })
        np.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(out).setBuffer(buf))
      }
      flapMesh.addPrimitive(np)
      if (keep.length) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(n < 65535 ? new Uint16Array(keep) : new Uint32Array(keep)).setBuffer(buf))
      else mesh.removePrimitive(prim)
    }
  }
  // animation glTF « drs_open » (0 → open_deg autour de x en 0,3 s, E) pour les visionneuses ; le jeu pilote le nœud directement
  const s = Math.sin(J.open_deg * Math.PI / 360), c = Math.cos(J.open_deg * Math.PI / 360)
  const smp = doc.createAnimationSampler().setInput(doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 0.3])).setBuffer(buf))
    .setOutput(doc.createAccessor().setType('VEC4').setArray(new Float32Array([0, 0, 0, 1, s, 0, 0, c])).setBuffer(buf)).setInterpolation('LINEAR')
  doc.createAnimation('drs_open').addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(pivot).setTargetPath('rotation').setSampler(smp))
  await doc.transform(prune({ keepAttributes: true, keepLeaves: false }))
  await io.write(f, doc)
  report[q] = { tris_volet: moved, tris_total: total, tris_volet_blender: J.tris.length, parMaillage: perMesh, avant_o: fs.statSync(bak).size, apres_o: fs.statSync(f).size }
  console.log(q, JSON.stringify(report[q]))
}
fs.writeFileSync(W + '/assets-work/split_drs_report.json', JSON.stringify(report, null, 1))
