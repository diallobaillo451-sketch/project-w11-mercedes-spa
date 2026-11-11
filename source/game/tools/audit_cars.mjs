// Audit LECTURE SEULE des voitures : poids, triangles, appels de rendu, UV, sens des faces, positions des roues, étendues par matériau.
// Usage : node audit_cars.mjs <dossier public>
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

const pub = process.argv[2] || 'public';
const mo = (n) => (n / 1048576).toFixed(2) + ' Mo';
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
const log = (...a) => console.log(...a);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });

const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

async function analyse(file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const out = { file, bytes: fs.statSync(file).size, ext: root.listExtensionsUsed().map((e) => e.extensionName.replace('KHR_', '').replace('EXT_', '')), meshes: [], wheels: {}, mats: {}, tris: 0, draw: 0 };
  for (const n of root.listNodes()) {
    const nm = n.getName();
    const m = /^W_(FL|FR|RL|RR)(?:\.L\d)?$/.exec(nm);
    if (m) { const w = n.getWorldMatrix(); out.wheels[m[1]] = [w[12], w[13], w[14]]; }
    const mesh = n.getMesh();
    if (!mesh) continue;
    const W = n.getWorldMatrix();
    const dt = det3(W);
    for (const p of mesh.listPrimitives()) {
      if (p.getMode() !== 4) continue;
      const pos = p.getAttribute('POSITION'); if (!pos) continue;
      const idx = p.getIndices();
      const nv = pos.getCount();
      const V = new Float64Array(nv * 3), t = [0, 0, 0];
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < nv; i++) {
        pos.getElement(i, t); const q = apply(W, t[0], t[1], t[2]);
        V[i * 3] = q[0]; V[i * 3 + 1] = q[1]; V[i * 3 + 2] = q[2]; cx += q[0]; cy += q[1]; cz += q[2];
        for (let k = 0; k < 3; k++) { if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; }
      }
      cx /= nv; cy /= nv; cz /= nv;
      const ni = idx ? idx.getCount() : nv; const nt = Math.floor(ni / 3);
      let outward = 0, area = 0; const ii = [0];
      for (let k = 0; k < nt; k++) {
        const a = idx ? (idx.getElement(k * 3, ii), ii[0]) : k * 3, b = idx ? (idx.getElement(k * 3 + 1, ii), ii[0]) : k * 3 + 1, c = idx ? (idx.getElement(k * 3 + 2, ii), ii[0]) : k * 3 + 2;
        const ax = V[b * 3] - V[a * 3], ay = V[b * 3 + 1] - V[a * 3 + 1], az = V[b * 3 + 2] - V[a * 3 + 2];
        const bx = V[c * 3] - V[a * 3], by = V[c * 3 + 1] - V[a * 3 + 1], bz = V[c * 3 + 2] - V[a * 3 + 2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const tx = (V[a * 3] + V[b * 3] + V[c * 3]) / 3 - cx, ty = (V[a * 3 + 1] + V[b * 3 + 1] + V[c * 3 + 1]) / 3 - cy, tz = (V[a * 3 + 2] + V[b * 3 + 2] + V[c * 3 + 2]) / 3 - cz;
        if (nx * tx + ny * ty + nz * tz > 0) outward++;
        area += Math.hypot(nx, ny, nz) / 2;
      }
      const uv = p.getAttribute('TEXCOORD_0'); let uvr = null;
      if (uv) { let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; const s = Math.max(1, Math.floor(uv.getCount() / 400)); for (let i = 0; i < uv.getCount(); i += s) { uv.getElement(i, t); u0 = Math.min(u0, t[0]); u1 = Math.max(u1, t[0]); v0 = Math.min(v0, t[1]); v1 = Math.max(v1, t[1]); } uvr = [u0, u1, v0, v1]; }
      const mat = p.getMaterial(); const mn = mat ? mat.getName() : '(aucun)';
      out.tris += nt; out.draw++;
      out.meshes.push({ node: nm, mat: mn, tris: nt, lo, hi, outward: nt ? (dt < 0 ? 1 - outward / nt : outward / nt) : 0, det: dt < 0 ? -1 : 1, uv: !!uv, uvr, area, quant: pos.getComponentType() !== 5126 });
      const M = out.mats[mn] || (out.mats[mn] = { tris: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] });
      M.tris += nt; for (let k = 0; k < 3; k++) { M.lo[k] = Math.min(M.lo[k], lo[k]); M.hi[k] = Math.max(M.hi[k], hi[k]); }
    }
  }
  out.textures = root.listTextures().map((x) => { let s = null; try { s = x.getSize(); } catch (_) {} return { mime: x.getMimeType(), size: s, bytes: x.getImage() ? x.getImage().byteLength : 0 }; });
  const all = out.meshes; out.lo = [0, 1, 2].map((k) => Math.min(...all.map((m) => m.lo[k]))); out.hi = [0, 1, 2].map((k) => Math.max(...all.map((m) => m.hi[k])));
  return out;
}
const bb = (o) => `x[${f2(o.lo[0])},${f2(o.hi[0])}] y[${f2(o.lo[1])},${f2(o.hi[1])}] z[${f2(o.lo[2])},${f2(o.hi[2])}]`;
const wh = (o) => Object.entries(o.wheels).map(([k, v]) => `${k}(${v.map(f2).join(',')})`).join(' ') || '(aucun nœud W_xx)';

// ---------- 1) poids du site ----------
log('=== POIDS DU SITE (public/ après assemblage) ===');
const sizes = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), s = fs.statSync(p); if (s.isDirectory()) walk(p); else sizes.push([p, s.size]); } })(pub);
const tot = sizes.reduce((a, [, s]) => a + s, 0);
log(`total : ${mo(tot)} (${sizes.length} fichiers)`);
const cat = {};
for (const [p, s] of sizes) { const r = path.relative(pub, p).split(path.sep); const k = r.length > 1 ? (r[0] === 'assets' && r.length > 2 ? r[0] + '/' + r[1] : r[0]) : '(racine)'; cat[k] = (cat[k] || 0) + s; }
for (const [k, s] of Object.entries(cat).sort((a, b) => b[1] - a[1])) log(`  ${k.padEnd(28)} ${mo(s).padStart(10)}  ${((s / tot) * 100).toFixed(1)} %`);
const ext = {};
for (const [p, s] of sizes) { const e = path.extname(p).toLowerCase() || '(sans)'; ext[e] = (ext[e] || 0) + s; }
log('par type : ' + Object.entries(ext).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([e, s]) => `${e}=${mo(s)}`).join(' | '));
log('les 25 plus gros fichiers :');
for (const [p, s] of sizes.sort((a, b) => b[1] - a[1]).slice(0, 25)) log(`  ${mo(s).padStart(10)}  ${path.relative(pub, p)}`);

// ---------- 2) voitures ----------
const carsDir = path.join(pub, 'cars');
const files = fs.readdirSync(carsDir).filter((f) => f.endsWith('.glb')).sort();
log('\n=== FICHIERS cars/ ===');
for (const f of files) log(`  ${f.padEnd(28)} ${mo(fs.statSync(path.join(carsDir, f)).size)}`);
const ids = [...new Set(files.map((f) => f.replace(/_(hi|lod1|lod2)\.glb$/, '')))].filter((i) => !i.endsWith('.glb'));
const cache = {};
async function get(f) { if (!cache[f]) { try { cache[f] = await analyse(f); } catch (e) { cache[f] = { error: String(e.message || e) }; } } return cache[f]; }
for (const id of ids) {
  log(`\n################ ${id} ################`);
  const hiPath = id === 'mercedes' ? path.join(pub, 'assets', 'w11_lh2020_high_ktx2.glb') : path.join(carsDir, id + '_hi.glb');
  const tiers = [['hi', hiPath], ['lod1', path.join(carsDir, id + '_lod1.glb')], ['lod2', path.join(carsDir, id + '_lod2.glb')]];
  const R = {};
  for (const [tn, p] of tiers) {
    if (!fs.existsSync(p)) { log(`  ${tn}: fichier absent (${path.relative(pub, p)})`); continue; }
    const a = await get(p); R[tn] = a;
    if (a.error) { log(`  ${tn}: ERREUR ${a.error}`); continue; }
    const tx = a.textures.length ? `${a.textures.length} tex (${a.textures.slice(0, 1).map((t) => t.mime + ' ' + (t.size || []).join('x')).join('')}…)` : '0 tex';
    log(`  ${tn.padEnd(4)} ${mo(a.bytes).padStart(9)} | ${a.tris.toLocaleString('fr-FR').padStart(8)} tris | ${String(a.draw).padStart(3)} appels | ${Object.keys(a.mats).length} matériaux | ${tx} | ext ${a.ext.join(',') || '-'}`);
    log(`       bbox ${bb(a)}`);
    log(`       roues ${wh(a)}`);
  }
  if (R.hi && !R.hi.error) for (const tn of ['lod1', 'lod2']) {
    const a = R[tn]; if (!a || a.error) continue; const h = R.hi;
    const d = [0, 1, 2].map((k) => [a.lo[k] - h.lo[k], a.hi[k] - h.hi[k]]);
    log(`  Δ ${tn} vs hi : bbox min/max (x,y,z) = ${d.map(([x, y]) => `${f2(x)}/${f2(y)}`).join('  ')}`);
    const wd = Object.keys(h.wheels).filter((k) => a.wheels[k]).map((k) => `${k}:${[0, 1, 2].map((i) => f2(a.wheels[k][i] - h.wheels[k][i])).join(',')}`);
    if (wd.length) log(`  Δ ${tn} roues vs hi : ${wd.join('  ')}`);
  }
  // matériaux « roue / pneu / peinture » : étendue par niveau
  for (const tn of ['hi', 'lod1', 'lod2']) {
    const a = R[tn]; if (!a || a.error) continue;
    const rows = Object.entries(a.mats).filter(([n]) => /tyre|tire|wheel|rim|paint/i.test(n)).slice(0, 5);
    for (const [n, m] of rows) log(`   ${tn.padEnd(4)} mat ${n.slice(0, 26).padEnd(26)} ${String(m.tris).padStart(7)} tris  x[${f2(m.lo[0])},${f2(m.hi[0])}] y[${f2(m.lo[1])},${f2(m.hi[1])}] z[${f2(m.lo[2])},${f2(m.hi[2])}]`);
  }
  // anomalies : faces inversées, UV absentes / hors plage
  for (const tn of ['lod1', 'lod2']) {
    const a = R[tn]; if (!a || a.error) continue;
    const bad = a.meshes.filter((m) => m.tris >= 150 && (m.outward < 0.3 || !m.uv || (m.uvr && (m.uvr[0] < -0.5 || m.uvr[1] > 1.5 || m.uvr[2] < -0.5 || m.uvr[3] > 1.5))));
    log(`  anomalies ${tn} : ${bad.length} maillage(s) sur ${a.meshes.length}`);
    for (const m of bad.slice(0, 12)) log(`     ${m.node.slice(0, 30).padEnd(30)} mat ${m.mat.slice(0, 22).padEnd(22)} tris ${String(m.tris).padStart(6)} faces-visibles-vers-l'extérieur ${(m.outward * 100).toFixed(0)} % det ${m.det} uv ${m.uv ? JSON.stringify((m.uvr || []).map(f2)) : 'ABSENTE'}`);
  }
  // pièces fines (suspensions, bras, aileron) : maillages de l'hi absents du lod1
  if (R.hi && R.lod1 && !R.hi.error && !R.lod1.error) {
    const names = new Set(R.lod1.meshes.map((m) => m.node.replace(/\.L1$/, '')));
    const missing = R.hi.meshes.filter((m) => !names.has(m.node) && m.tris > 80).map((m) => `${m.node}(${m.tris})`);
    log(`  maillages du hi absents du lod1 (>80 tris) : ${missing.length} ${missing.slice(0, 14).join(' ')}`);
  }
}
log('\n=== FIN DE L\'AUDIT ===');
