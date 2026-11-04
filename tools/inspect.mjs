// Diagnostic LECTURE SEULE : statistiques des modèles 3D + extraits du bundle (réglages de qualité).
// Usage : node inspect.mjs <dossier public>
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

const pub = process.argv[2] || 'public';
const mo = (n) => (n / 1048576).toFixed(2) + ' Mo';
const log = (...a) => console.log(...a);

// ---------- 1) Modèles GLB ----------
async function inspectGlb(file) {
  const size = fs.statSync(file).size;
  log(`\n=== ${path.relative(pub, file)} — fichier ${mo(size)} ===`);
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'meshopt.decoder': MeshoptDecoder,
    });
  const doc = await io.read(file);
  const root = doc.getRoot();
  log('extensions utilisées :', root.listExtensionsUsed().map((e) => e.extensionName).join(', ') || '(aucune)');

  const nodes = root.listNodes();
  const meshes = root.listMeshes();
  let uniqVerts = 0, uniqTris = 0, uniqPrims = 0;
  const attrBytes = {};
  const meshStats = new Map();
  for (const m of meshes) {
    let v = 0, t = 0;
    for (const p of m.listPrimitives()) {
      uniqPrims++;
      const pos = p.getAttribute('POSITION');
      const idx = p.getIndices();
      const vc = pos ? pos.getCount() : 0;
      v += vc;
      t += idx ? idx.getCount() / 3 : vc / 3;
      for (const sem of p.listSemantics()) {
        const a = p.getAttribute(sem);
        const key = `${sem.replace(/_\d+$/, '')}:${a.getComponentType()}`;
        attrBytes[key] = (attrBytes[key] || 0) + a.getArray().byteLength;
      }
      if (idx) attrBytes['INDICES:' + idx.getComponentType()] = (attrBytes['INDICES:' + idx.getComponentType()] || 0) + idx.getArray().byteLength;
    }
    uniqVerts += v; uniqTris += t;
    meshStats.set(m, { v, t, prims: m.listPrimitives().length });
  }
  let drawCalls = 0, instTris = 0, meshNodes = 0;
  for (const n of nodes) {
    const m = n.getMesh();
    if (!m) continue;
    meshNodes++;
    const s = meshStats.get(m);
    drawCalls += s.prims;
    instTris += s.t;
  }
  log(`noeuds: ${nodes.length} (avec mesh: ${meshNodes}) | meshes uniques: ${meshes.length} | primitives uniques: ${uniqPrims}`);
  log(`sommets (uniques): ${uniqVerts.toLocaleString('fr-FR')} | triangles uniques: ${Math.round(uniqTris).toLocaleString('fr-FR')} | triangles instanciés: ${Math.round(instTris).toLocaleString('fr-FR')}`);
  log(`appels de rendu estimés (1 par primitive/nœud, sans instancing) : ${drawCalls.toLocaleString('fr-FR')}`);
  log('mémoire géométrie par attribut:componentType (5126=float32, 5123=u16, 5125=u32, 5120/5121=8bit, 5122=i16):');
  log('  ' + Object.entries(attrBytes).sort((a, b) => b[1] - a[1]).map(([k, b]) => `${k}=${mo(b)}`).join(' | '));

  try {
    const sc = root.getDefaultScene() || root.listScenes()[0];
    if (sc) {
      const b = getBounds(sc);
      const d = b.max.map((x, i) => (x - b.min[i]).toFixed(1));
      log(`dimensions scène (unités du modèle) : ${d.join(' × ')}`);
    }
  } catch (e) { log('bounds: n/a', e.message); }

  // Gros meshes
  const top = [...meshStats.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 8);
  log('top meshes (triangles):');
  for (const [m, s] of top) log(`  ${(m.getName() || '(sans nom)').slice(0, 50).padEnd(50)} tris=${Math.round(s.t).toLocaleString('fr-FR')} prims=${s.prims}`);

  // Matériaux
  const mats = root.listMaterials();
  const alpha = {};
  let dbl = 0, extMat = {};
  for (const m of mats) {
    alpha[m.getAlphaMode()] = (alpha[m.getAlphaMode()] || 0) + 1;
    if (m.getDoubleSided()) dbl++;
    for (const e of m.listExtensions()) extMat[e.extensionName] = (extMat[e.extensionName] || 0) + 1;
  }
  log(`matériaux: ${mats.length} | alphaMode: ${JSON.stringify(alpha)} | doubleSided: ${dbl} | extensions: ${JSON.stringify(extMat)}`);

  // Textures
  const texs = root.listTextures();
  const groups = {};
  let fileBytes = 0, gpuBytes = 0;
  for (const t of texs) {
    const img = t.getImage();
    const bytes = img ? img.byteLength : 0;
    let sz = null;
    try { sz = t.getSize(); } catch (_) {}
    const mime = t.getMimeType();
    const [w, h] = sz || [0, 0];
    const isKtx = mime === 'image/ktx2';
    const gpu = isKtx ? bytes * 1.33 : w * h * 4 * 1.33;
    fileBytes += bytes; gpuBytes += gpu;
    const key = `${w}x${h} ${mime}`;
    const g = groups[key] || (groups[key] = { n: 0, bytes: 0, gpu: 0 });
    g.n++; g.bytes += bytes; g.gpu += gpu;
  }
  log(`textures: ${texs.length} | poids fichier ${mo(fileBytes)} | VRAM estimée (mipmaps incl.) ${mo(gpuBytes)}`);
  for (const [k, g] of Object.entries(groups).sort((a, b) => b[1].gpu - a[1].gpu).slice(0, 12))
    log(`  ${k.padEnd(26)} x${String(g.n).padEnd(4)} fichier ${mo(g.bytes).padEnd(10)} VRAM ~${mo(g.gpu)}`);
  log(`animations: ${root.listAnimations().length} | skins: ${root.listSkins().length}`);
}


// ---------- 1b) Résumé de fichiers JSON de données ----------
function summarizeJson(file, label) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { log(`\n${label}: JSON illisible (${e.message})`); return; }
  log(`\n=== ${label} — ${mo(fs.statSync(file).size)} ===`);
  const describe = (v) => Array.isArray(v)
    ? `array[${v.length}]${v.length ? ' de ' + (Array.isArray(v[0]) ? 'array[' + v[0].length + ']' : v[0] && typeof v[0] === 'object' ? '{' + Object.keys(v[0]).join(',') + '}' : typeof v[0]) : ''}`
    : v && typeof v === 'object' ? '{' + Object.keys(v).slice(0, 25).join(',') + '}' : typeof v + ' = ' + String(v).slice(0, 80);
  if (Array.isArray(j)) { log(describe(j)); log('  ex:', JSON.stringify(j.slice(0, 2)).slice(0, 400)); return; }
  for (const [k, v] of Object.entries(j)) {
    log(`- ${k}: ${describe(v)}`);
    const sample = Array.isArray(v) ? JSON.stringify(v.slice(0, 2)) : v && typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : '';
    if (sample) log(`    ex: ${sample.slice(0, 300)}`);
  }
}

// ---------- 2) Bundle JS : extraits autour des mots-clés de qualité ----------
function grepBundle(file) {
  const src = fs.readFileSync(file, 'utf8');
  log(`\n=== BUNDLE ${path.relative(pub, file)} — ${mo(src.length)} ===`);
  const pats = [
    ['modèles chargés', /\.glb|\.gltf/g],
    ['lod / mobile', /lod1|_lod|isMobile|mobile/gi],
    ['userAgent / appareil', /userAgent|iPhone|iPad|maxTouchPoints|hardwareConcurrency|deviceMemory/g],
    ['pixel ratio / dpr', /setPixelRatio|devicePixelRatio|dpr\s*[:=]|PixelRatio/g],
    ['antialias / gl props', /antialias|powerPreference|preserveDrawingBuffer|failIfMajorPerformanceCaveat|stencil\s*:/g],
    ['ombres', /shadowMap|shadows\s*[:=]|castShadow|receiveShadow|shadow-mapSize|mapSize/g],
    ['qualité / tiers', /[Qq]uality|qualit[eé]|tier\b|lowPower|perfMode|PERF|detail/g],
    ['post-processing', /EffectComposer|Bloom|SSAO|N8AO|Vignette|ToneMapping|SMAA|FXAA|MSAA|multisampling/g],
    ['anisotropie / textures', /anisotropy|getMaxAnisotropy|generateMipmaps|minFilter|colorSpace/g],
    ['décodeurs', /MeshoptDecoder|DRACOLoader|KTX2Loader|setDecoderPath|basis_transcoder|draco/gi],
    ['contexte perdu', /webglcontextlost|webglcontextrestored|contextlost|contextrestored|onContextLost/gi],
    ['culling / visibilité', /frustumCulled|\.dispose\(|Bvh|AdaptiveDpr|PerformanceMonitor|Preload|useProgress/g],
    ['caméra far/fog', /\bfar\s*[:=]|fog|Fog/g],
    ['renderer.info / stats', /renderer\.info|\.info\.render|gl\.info|Stats\b/g],
    ['lumières / ciel', /directionalLight|ambientLight|hemisphereLight|pointLight|spotLight|rectAreaLight|sky_1k|\.hdr|RGBELoader|backgroundIntensity|environmentIntensity|backgroundBlurriness/g],
    ['matériaux voiture', /clearcoat|MeshPhysicalMaterial|meshPhysicalMaterial|envMapIntensity|emissive|metalness/g],
    ['feux / freins', /headlight|taillight|brakeLight|brake|feux|phare/gi],
    ['conduite / physique', /throttle|steer|rpm|gear|drs|lateral|grip/gi],
    ['boucle de rendu', /getElapsedTime|performance\.now|requestAnimationFrame|frameloop|useFrame/g],
    ['audio (WebAudio)', /AudioContext|createGain|createBufferSource|decodeAudioData|playbackRate|createBiquadFilter|createDynamicsCompressor|engine-map|on_\d|off_\d/g],
    ['HUD / chrono / secteurs', /km\/h|KM\/H|chrono|secteur|sector|lap\s*time|bestLap|S1|S2|S3|DRS|ERS/g],
    ['atmosphère / ciel', /sky|Sky|cloud|nuage|sunset|coucher|daylight|exposure|toneMappingExposure|turbidity|rayleigh/g],
  ];
  for (const [label, re] of pats) {
    const all = [...src.matchAll(re)];
    log(`\n--- ${label} : ${all.length} occurrence(s) ---`);
    let last = -1e9, shown = 0;
    for (const m of all) {
      if (m.index - last < 500) continue;
      if (shown >= 5) break;
      last = m.index; shown++;
      const a = Math.max(0, m.index - 170), b = Math.min(src.length, m.index + 330);
      log(`[@${m.index}] …${src.slice(a, b).replace(/\s+/g, ' ')}…`);
    }
  }
}

// ---------- main ----------
const glbs = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.glb$/i.test(f)) glbs.push(p);
  }
})(pub);

log('--- index.html ---');
log(fs.readFileSync(path.join(pub, 'index.html'), 'utf8').slice(0, 4000));

for (const g of glbs) {
  try { await inspectGlb(g); } catch (e) { log(`ERREUR sur ${g}: ${e.stack || e}`); }
}
for (const rel of ['assets/spa/tiles.json', 'assets/spa/tex/ktx2.json', 'track/surface.json', 'audio/engine/engine-map.json', 'manifest.webmanifest']) {
  const f = path.join(pub, rel);
  if (fs.existsSync(f)) summarizeJson(f, rel);
}
const swFile = path.join(pub, 'sw.js');
if (fs.existsSync(swFile)) log(`\n=== sw.js (${mo(fs.statSync(swFile).size)}) — début ===\n` + fs.readFileSync(swFile, 'utf8').slice(0, 2500));

// Bundles réellement utilisés : scripts de index.html + chunks importés statiquement
const assetsDir = path.join(pub, 'assets');
log('\n=== fichiers JS/CSS de assets/ ===');
for (const f of fs.readdirSync(assetsDir)) if (/\.(js|css|wasm)$/.test(f)) log(`  ${f}  ${mo(fs.statSync(path.join(assetsDir, f)).size)}`);
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const targets = new Set([...html.matchAll(/src=["'][^"']*\/assets\/([^"']+\.js)["']/g)].map((m) => m[1]));
for (const t of [...targets]) {
  const code = fs.readFileSync(path.join(assetsDir, t), 'utf8');
  for (const m of code.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) targets.add(m[1]);
}
log('\nbundles analysés :', [...targets].join(', '));
for (const t of targets) if (!/basis_transcoder/.test(t) && fs.existsSync(path.join(assetsDir, t))) grepBundle(path.join(assetsDir, t));
log('\n=== FIN DU DIAGNOSTIC ===');
