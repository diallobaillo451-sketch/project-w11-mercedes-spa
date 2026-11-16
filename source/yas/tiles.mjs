// Scène de Yas Marina découpée en tuiles (chargement progressif, proches d'abord), format identique à Spa / Monza (tiles.json + tNN.gltf/.bin + tex/*.webp).
// Adapté de source/tools/build_track_tiles.mjs ; différences : textures plafonnées (asphalte 1024, sols 512, reste 256 : mémoire GPU maîtrisée sur mobile),
// modes alpha et extras (w11_class / w11_alias) déjà posés par prep_glb.py, aucun renommage de matériau.
// Usage : node tiles.mjs in.glb outDir [K=10] [qColor=88] [qNormal=95] [capRoad=1024] [capSoil=512] [capOther=256]
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const [,, inp, outDir, Ks='10', qC='88', qN='95', capR='1024', capS='512', capO='256'] = process.argv;
const K = +Ks;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc = await io.read(inp);
await doc.transform(dedup(), prune(), weld());
doc.getRoot().listMaterials().forEach((m, i) => m.setExtras({ ...m.getExtras(), mid: i }));
// textures : R_ (asphalte, vibreurs : 1024), S_ (herbe, gravier, peint, palmier : 512), N_ (normales : 512), O_ (le reste : 256) → mémoire GPU maîtrisée
const CLS = { road: 'R', kerb: 'R', grass: 'S', gravel: 'S', carpet: 'S', tree: 'S' };
const kind = new Map(), normals = new Set();
for (const m of doc.getRoot().listMaterials()) {
  const k = CLS[m.getExtras()?.w11_class];
  if (m.getNormalTexture()) normals.add(m.getNormalTexture());
  if (k) for (const t of [m.getBaseColorTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture(), m.getEmissiveTexture()]) if (t && kind.get(t) !== 'R') kind.set(t, k);
}
doc.getRoot().listTextures().forEach((t, i) => t.setName((normals.has(t) ? 'N' : kind.get(t) ?? 'O') + '_' + i));
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: +qC, resize: [+capR, +capR], pattern: /^R_/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: +qC, resize: [+capS, +capS], pattern: /^S_/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: +qN, resize: [+capS, +capS], pattern: /^N_/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: +qC, resize: [+capO, +capO], pattern: /^O_/ }),
  reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^(NORMAL|TEXCOORD|TANGENT|COLOR)/ }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
const master = await io.writeBinary(doc);
// affectation des nœuds : base (très grands objets) puis K tuiles par k-moyennes (x,z)
const info = doc.getRoot().listNodes().filter(n => n.getMesh()).map(n => { const b = getBounds(n);
  return { name: n.getName(), cx: (b.min[0] + b.max[0]) / 2, cz: (b.min[2] + b.max[2]) / 2, s: Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]), b } });
const base = info.filter(i => i.s > 1500), rest = info.filter(i => !base.includes(i));
let C = Array.from({ length: K }, (_, k) => { const i = rest[Math.floor((k + 0.5) * rest.length / K)]; return [i.cx, i.cz] });
for (let it = 0; it < 60; it++) { const acc = C.map(() => [0, 0, 0]);
  for (const i of rest) { let bk = 0, bd = 1e18; C.forEach((c, k) => { const d = (c[0]-i.cx)**2 + (c[1]-i.cz)**2; if (d < bd) { bd = d; bk = k } }); i.k = bk; acc[bk][0] += i.cx; acc[bk][1] += i.cz; acc[bk][2]++ }
  C = C.map((c, k) => acc[k][2] ? [acc[k][0]/acc[k][2], acc[k][1]/acc[k][2]] : c) }
base.forEach(i => i.k = -1);
fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(path.join(outDir, 'tex'), { recursive: true });
const tiles = []; const texSeen = new Map(); let texBytes = 0;
for (let k = -1; k < K; k++) {
  const mine = new Set(info.filter(i => i.k === k).map(i => i.name)); if (!mine.size) continue;
  const d = await io.readBinary(master);
  for (const n of d.getRoot().listNodes()) if (n.getMesh() && !mine.has(n.getName())) n.dispose();
  await d.transform(prune({ keepExtras: true }));
  for (const t of d.getRoot().listTextures()) { const img = t.getImage(); const h = crypto.createHash('sha1').update(img).digest('hex').slice(0, 16);
    const uri = 'tex/' + h + '.webp'; t.setURI(uri); if (!texSeen.has(h)) { fs.writeFileSync(path.join(outDir, uri), img); texSeen.set(h, img.byteLength); texBytes += img.byteLength } }
  const id = k < 0 ? 'base' : 't' + String(k).padStart(2, '0');
  d.getRoot().listBuffers().forEach(b => b.setURI(id + '.bin'));
  const { json, resources } = await io.writeJSON(d);
  let geo = 0; for (const [u, data] of Object.entries(resources)) if (!u.startsWith('tex/')) { fs.writeFileSync(path.join(outDir, u), data); geo += data.byteLength }
  fs.writeFileSync(path.join(outDir, id + '.gltf'), JSON.stringify(json));
  const sel = info.filter(i => i.k === k); const mn = [1e9, 1e9], mx = [-1e9, -1e9];
  for (const i of sel) { mn[0] = Math.min(mn[0], i.b.min[0]); mn[1] = Math.min(mn[1], i.b.min[2]); mx[0] = Math.max(mx[0], i.b.max[0]); mx[1] = Math.max(mx[1], i.b.max[2]) }
  const tris = d.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  const used = new Set(d.getRoot().listMeshes().flatMap(m => m.listPrimitives().map(p => p.getMaterial()).filter(Boolean)));
  const texs = [...new Set(d.getRoot().listTextures().filter(t => t.listParents().some(p => used.has(p))).map(t => t.getURI()))];
  tiles.push({ id, file: id + '.gltf', nodes: sel.length, tris, cx: +((mn[0]+mx[0])/2).toFixed(1), cz: +((mn[1]+mx[1])/2).toFixed(1), r: +(Math.hypot(mx[0]-mn[0], mx[1]-mn[1])/2).toFixed(1), geoBytes: geo, tex: texs });
  console.log(id, sel.length, 'nœuds', tris, 'tris', (geo/1e6).toFixed(2), 'Mo géo', texs.length, 'tex');
}
const texSizes = Object.fromEntries([...texSeen].map(([h, b]) => ['tex/' + h + '.webp', b]));
fs.writeFileSync(path.join(outDir, 'tiles.json'), JSON.stringify({ version: 1, source: path.basename(inp), tiles, texSizes }, null, 1));
const tot = tiles.reduce((a, t) => a + t.geoBytes, 0) + texBytes;
console.log('textures', texSeen.size, (texBytes/1e6).toFixed(1), 'Mo ; total', (tot/1e6).toFixed(1), 'Mo');
let gpu = 0; const dims = {}; for (const [h, b] of texSeen) { const s = await sharp(fs.readFileSync(path.join(outDir, 'tex', h + '.webp'))).metadata(); gpu += s.width*s.height*4*1.33; dims[s.width+'x'+s.height] = (dims[s.width+'x'+s.height]||0)+1 }
console.log('dims', JSON.stringify(dims), 'GPU Mo', (gpu/1e6).toFixed(0));
