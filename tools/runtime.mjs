// Diagnostic RUNTIME (lecture seule) : charge le site dans Chromium headless (WebGL logiciel SwiftShader),
// capte le renderer et la scène three.js via __THREE_DEVTOOLS__, puis mesure réseau, scène, lumières, matériaux, JS.
// Usage : node runtime.mjs <dossier public> <dossier sortie>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const root = path.resolve(process.argv[2] || 'public');
const outDir = path.resolve(process.argv[3] || 'diag');
fs.mkdirSync(outDir, { recursive: true });
const log = (...a) => console.log(...a);
const mo = (n) => (n / 1048576).toFixed(2) + ' Mo';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- serveur statique ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.hdr': 'application/octet-stream', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.png': 'image/png', '.webp': 'image/webp', '.ktx2': 'image/ktx2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Content-Length': b.length });
    res.end(b);
  });
});
await new Promise((r) => server.listen(8080, r));

// ---------- crochet injecté avant le code de la page ----------
const HOOK = () => {
  const C = (window.__captured = { renderers: [], scenes: [], camera: null, renders: 0, renderMs: 0 });
  const t = new EventTarget();
  t.addEventListener('observe', (e) => {
    const o = e.detail;
    if (!o) return;
    if (o.isWebGLRenderer) {
      C.renderers.push(o);
      const orig = o.render.bind(o);
      o.render = function (s, c) {
        C.camera = c;
        const a = performance.now();
        const r = orig(s, c);
        C.renderMs += performance.now() - a;
        C.renders++;
        return r;
      };
    } else if (o.isScene) C.scenes.push(o);
  });
  window.__THREE_DEVTOOLS__ = t;
  // sonde audio : compte les noeuds, mémorise les buffers décodés et ce qui se branche sur la sortie
  const A = (window.__audio = { sources: 0, gains: 0, filters: 0, comps: 0, analysers: 0, panners: 0, decoded: [], toDest: {} });
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    const P = AC.prototype;
    const wrap = (name, key) => { const o = P[name]; if (!o) return; P[name] = function (...a) { A[key]++; return o.apply(this, a); }; };
    wrap('createBufferSource', 'sources'); wrap('createGain', 'gains'); wrap('createBiquadFilter', 'filters');
    wrap('createDynamicsCompressor', 'comps'); wrap('createAnalyser', 'analysers'); wrap('createPanner', 'panners');
    const dd = P.decodeAudioData;
    if (dd) P.decodeAudioData = function (buf, ...rest) {
      const p = dd.call(this, buf, ...rest);
      Promise.resolve(p).then((ab) => { if (ab) A.decoded.push([+ab.duration.toFixed(2), ab.numberOfChannels, ab.sampleRate]); }).catch(() => {});
      return p;
    };
    const oc = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (d, ...r) {
      try { if (d && d.constructor && d.constructor.name === 'AudioDestinationNode') { const k = this.constructor.name; A.toDest[k] = (A.toDest[k] || 0) + 1; } } catch (_) {}
      return oc.call(this, d, ...r);
    };
  }
};

// ---------- rapport exécuté dans la page ----------
const REPORT = () => {
  const C = window.__captured;
  const out = { renderers: C.renderers.length, scenes: C.scenes.length, renders: C.renders, renderMsPerCall: C.renders ? +(C.renderMs / C.renders).toFixed(2) : null };
  const r = C.renderers[0];
  if (r) {
    const gl = r.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    out.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a';
    out.glAttrs = gl.getContextAttributes();
    out.renderer = {
      pixelRatio: r.getPixelRatio(),
      canvasPx: [r.domElement.width, r.domElement.height],
      cssPx: [r.domElement.clientWidth, r.domElement.clientHeight],
      toneMapping: r.toneMapping, exposure: r.toneMappingExposure, outputColorSpace: r.outputColorSpace,
      shadowMap: { enabled: r.shadowMap.enabled, type: r.shadowMap.type, autoUpdate: r.shadowMap.autoUpdate },
      info: { calls: r.info.render.calls, triangles: r.info.render.triangles, lines: r.info.render.lines, points: r.info.render.points, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs ? r.info.programs.length : null },
      caps: { maxTex: r.capabilities.maxTextureSize, maxAniso: r.capabilities.getMaxAnisotropy(), webgl2: r.capabilities.isWebGL2, logDepth: r.capabilities.logarithmicDepthBuffer },
    };
  }
  if (C.camera) {
    const c = C.camera;
    out.camera = { type: c.type, fov: c.fov, near: c.near, far: c.far, aspect: c.aspect, pos: [c.matrixWorld.elements[12], c.matrixWorld.elements[13], c.matrixWorld.elements[14]].map((v) => +v.toFixed(1)) };
  }
  if (performance.memory) out.jsHeapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1);
  if (window.__audio) out.audio = { ...window.__audio, decoded: window.__audio.decoded.slice(0, 40) };
  if (typeof document !== 'undefined') {
    const leaves = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && (e.textContent || '').trim().length > 0 && (e.textContent || '').trim().length < 60);
    out.hudTexts = leaves.slice(0, 120).map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''} = ${(e.textContent || '').trim().replace(/\s+/g, ' ')}`);
    out.controls = [...document.querySelectorAll('button, [role=button], select, input')].slice(0, 60).map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} ${(e.textContent || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 40)}`);
    out.canvases = [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, cls: String(c.className || '') }));
  }

  const sizeOf = (s) => { let n = 0; s.traverse(() => n++); return n; };
  const sc = [...C.scenes].sort((a, b) => sizeOf(b) - sizeOf(a))[0];
  if (!sc) return out;
  const hex = (c) => (c && c.isColor ? '#' + c.getHexString() : null);
  const texInfo = (t) => {
    if (!t || !t.isTexture) return null;
    const im = t.image || (t.mipmaps && t.mipmaps[0]) || {};
    const d = im.data && im.data.width ? im.data : im;
    return { w: d.width || 0, h: d.height || 0, compressed: !!t.isCompressedTexture, cube: !!t.isCubeTexture, mapping: t.mapping, format: t.format, type: t.type, colorSpace: t.colorSpace };
  };
  out.scene = {
    objects: sizeOf(sc),
    background: sc.background ? (sc.background.isColor ? hex(sc.background) : texInfo(sc.background)) : null,
    environment: texInfo(sc.environment),
    fog: sc.fog ? { type: sc.fog.isFogExp2 ? 'exp2' : 'linear', color: hex(sc.fog.color), near: sc.fog.near, far: sc.fog.far, density: sc.fog.density } : null,
    backgroundIntensity: sc.backgroundIntensity, environmentIntensity: sc.environmentIntensity, backgroundBlurriness: sc.backgroundBlurriness,
  };

  const st = { meshes: 0, skinned: 0, instanced: 0, instances: 0, frustumCulledOff: 0, hidden: 0, castShadow: 0, receiveShadow: 0, points: 0, lines: 0, sprites: 0 };
  let verts = 0, tris = 0, trisInst = 0;
  const lights = [], mats = new Map(), texs = new Map(), geoms = new Set(), geomTypes = {};
  const TEXKEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'envMap', 'lightMap', 'bumpMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'transmissionMap', 'thicknessMap', 'displacementMap'];
  sc.traverse((o) => {
    if (!o.visible) st.hidden++;
    if (o.isLight) lights.push({ type: o.type, name: o.name, color: hex(o.color), intensity: +o.intensity.toFixed(3), pos: [o.matrixWorld.elements[12], o.matrixWorld.elements[13], o.matrixWorld.elements[14]].map((v) => +v.toFixed(1)), castShadow: !!o.castShadow, shadowMap: o.shadow ? o.shadow.mapSize.x : null });
    if (o.isPoints) st.points++;
    if (o.isLine) st.lines++;
    if (o.isSprite) st.sprites++;
    if (!o.isMesh) return;
    st.meshes++;
    if (o.isSkinnedMesh) st.skinned++;
    if (o.isInstancedMesh) { st.instanced++; st.instances += o.count; }
    if (!o.frustumCulled) st.frustumCulledOff++;
    if (o.castShadow) st.castShadow++;
    if (o.receiveShadow) st.receiveShadow++;
    const g = o.geometry;
    const p = g && g.attributes && g.attributes.position;
    if (p) {
      const t = (g.index ? g.index.count : p.count) / 3;
      trisInst += t * (o.isInstancedMesh ? o.count : 1);
      if (!geoms.has(g)) {
        geoms.add(g); verts += p.count; tris += t;
        const k = p.array.constructor.name + (p.normalized ? '(norm)' : '');
        geomTypes[k] = (geomTypes[k] || 0) + 1;
      }
    }
    for (const m of [].concat(o.material || [])) {
      if (!m) continue;
      mats.set(m, (mats.get(m) || 0) + 1);
      for (const k of TEXKEYS) {
        const t = m[k];
        if (t && t.isTexture && !texs.has(t)) texs.set(t, { k, ...texInfo(t), aniso: t.anisotropy, mips: t.generateMipmaps, minFilter: t.minFilter });
      }
    }
  });
  const matHist = {}, special = [];
  for (const m of mats.keys()) {
    const key = [m.type, m.transparent ? 'transp' : 'opaque', m.side === 2 ? 'double' : m.side === 1 ? 'back' : 'front', m.transmission > 0 ? 'transm' : '', m.clearcoat > 0 ? 'clearcoat' : ''].filter(Boolean).join('|');
    matHist[key] = (matHist[key] || 0) + 1;
    if ((m.clearcoat > 0 || m.transmission > 0 || (m.emissive && m.emissive.getHex() !== 0) || (m.envMapIntensity !== undefined && m.envMapIntensity !== 1)) && special.length < 40)
      special.push({ name: m.name, type: m.type, color: hex(m.color), metal: m.metalness, rough: m.roughness, clearcoat: m.clearcoat, ccRough: m.clearcoatRoughness, transm: m.transmission, emissive: hex(m.emissive), emissiveIntensity: m.emissiveIntensity, envMapIntensity: m.envMapIntensity, ior: m.ior });
  }
  let vram = 0;
  const texHist = {};
  for (const t of texs.values()) {
    const key = `${t.w}x${t.h}${t.compressed ? ' compressed' : ''}${t.mips ? '' : ' nomip'}`;
    texHist[key] = (texHist[key] || 0) + 1;
    if (!t.compressed) vram += t.w * t.h * 4 * (t.mips ? 1.33 : 1);
  }
  out.stats = { ...st, verts, tris: Math.round(tris), trisInstanced: Math.round(trisInst), uniqueGeometries: geoms.size, materials: mats.size, textures: texs.size, uncompressedTexVramMB: +(vram / 1048576).toFixed(1), geomTypes, matHist, texHist };
  out.special = special;
  out.lights = lights;

  const countMeshes = (o) => { let n = 0; o.traverse((x) => { if (x.isMesh) n++; }); return n; };
  out.topLevel = sc.children.slice(0, 60).map((c) => ({ type: c.type, name: c.name, children: c.children.length, meshes: countMeshes(c) }));

  // Racine probable de la voiture + son arbre
  const cand = [];
  sc.traverse((o) => { if (/ferrari|sf-?2\d|\bcar\b|f1|bolide|chassis/i.test(o.name || '') && o.children.length > 0) cand.push(o); });
  const scored = cand.map((o) => ({ o, meshes: countMeshes(o) })).filter((x) => x.meshes >= 5 && x.meshes < st.meshes * 0.6).sort((a, b) => b.meshes - a.meshes);
  out.carCandidates = scored.slice(0, 8).map((x) => ({ name: x.o.name, type: x.o.type, children: x.o.children.length, meshes: x.meshes }));
  if (scored[0]) {
    const lines = [];
    const tree = (o, d) => {
      if (lines.length > 170 || d > 6) return;
      const mm = o.isMesh ? [].concat(o.material).map((m) => m && m.name).join(',') : '';
      const tri = o.isMesh ? Math.round((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) : 0;
      lines.push(`${'  '.repeat(d)}${o.type}${o.name ? ' "' + o.name + '"' : ''}${mm ? ' mat=' + mm : ''}${tri ? ' tris=' + tri : ''}`);
      for (const c of o.children) tree(c, d + 1);
    };
    tree(scored[0].o, 0);
    out.carTree = lines;
  }
  return out;
};

// ---------- scénarios ----------
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PROFILES = [
  { name: 'iphone', viewport: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, ua: UA_IPHONE },
  { name: 'desktop', viewport: { width: 1280, height: 720, deviceScaleFactor: 1 }, ua: null },
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
log('Chromium :', await browser.version());

async function skyStats(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const region = (y0, y1) => {
    let n = 0, white = 0, r = 0, g = 0, b = 0;
    for (let y = Math.floor(h * y0); y < Math.floor(h * y1); y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        n++; r += data[i]; g += data[i + 1]; b += data[i + 2];
        if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) white++;
      }
    return { meanRGB: [r / n, g / n, b / n].map((v) => Math.round(v)), nearWhitePct: +((white / n) * 100).toFixed(1) };
  };
  return { size: [w, h], top30: region(0, 0.3), middle: region(0.3, 0.7), bottom30: region(0.7, 1) };
}

for (const prof of PROFILES) {
  log(`\n\n################ PROFIL ${prof.name} ################`);
  const page = await browser.newPage();
  await page.setViewport(prof.viewport);
  if (prof.ua) await page.setUserAgent(prof.ua);
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  const reqs = new Map(), done = [], logs = [];
  client.on('Network.responseReceived', (e) => reqs.set(e.requestId, { url: e.response.url.replace('http://localhost:8080/', ''), status: e.response.status }));
  client.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; done.push(r); } });
  await page.evaluateOnNewDocument(HOOK);
  page.on('console', (m) => { if (logs.length < 40) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e.message || e).slice(0, 400)));
  page.on('requestfailed', (r) => logs.push('REQFAILED ' + r.url()));

  const t0 = Date.now();
  try { await page.goto('http://localhost:8080/', { waitUntil: 'load', timeout: 240000 }); } catch (e) { logs.push('GOTO ' + e.message); }
  // le jeu demande « Toucher pour démarrer » : on clique tôt, puis on attend que la scène soit chargée et stable
  await sleep(5000);
  const clicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role=button], div, span, a, p')];
    const el = els.find((e) => /toucher pour d[ée]marrer|d[ée]marrer|start|jouer|play/i.test(e.textContent || '') && e.children.length <= 1);
    if (el) { el.click(); return (el.textContent || '').trim().slice(0, 50); }
    return null;
  }).catch(() => null);
  log('clic démarrage :', clicked);
  if (!clicked) { try { await page.mouse.click(prof.viewport.width / 2, prof.viewport.height / 2); } catch (_) {} }
  let last = -1, stable = 0;
  for (let i = 0; i < 180 && stable < 5; i++) {
    await sleep(2000);
    const n = await page.evaluate(() => (window.__captured ? Math.max(0, ...window.__captured.scenes.map((s) => { let c = 0; s.traverse(() => c++); return c; })) : -1)).catch(() => -1);
    stable = n === last && n > 200 ? stable + 1 : 0;
    last = n;
  }
  log(`temps jusqu'à scène stable : ${((Date.now() - t0) / 1000).toFixed(0)} s (objets: ${last})`);
  await sleep(4000);

  // 1) rapport de scène
  let report = null, hud0 = [];
  try { report = await page.evaluate(REPORT); } catch (e) { logs.push('REPORT ' + e.message); }
  log('\n--- RAPPORT SCÈNE ---');
  if (report) {
    const { carTree, special, lights, topLevel, carCandidates, hudTexts, controls, ...rest } = report;
    log(JSON.stringify(rest, null, 1));
    log('\n--- TEXTES DU HUD / INTERFACE (avant accélération) ---'); (hudTexts || []).forEach((t) => log(t));
    log('\n--- BOUTONS / CONTRÔLES ---'); (controls || []).forEach((t) => log(t));
    hud0 = hudTexts || [];
    log('\n--- LUMIÈRES ---'); (lights || []).forEach((l) => log(JSON.stringify(l)));
    log('\n--- MATÉRIAUX NOTABLES (clearcoat / transmission / émissif / envMapIntensity≠1) ---'); (special || []).forEach((m) => log(JSON.stringify(m)));
    log('\n--- NIVEAU SUPÉRIEUR DE LA SCÈNE ---'); (topLevel || []).forEach((t) => log(JSON.stringify(t)));
    log('\n--- CANDIDATS « VOITURE » ---'); (carCandidates || []).forEach((t) => log(JSON.stringify(t)));
    if (carTree) log('\n--- ARBRE DE LA VOITURE ---\n' + carTree.join('\n'));
  }

  // 1b) on maintient l'accélérateur (clavier) 8 s et on compare le HUD : repère vitesse / régime / rapport / chrono
  try {
    for (const k of ['ArrowUp', 'KeyW']) await page.keyboard.down(k);
    await sleep(8000);
    const hud1 = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && (e.textContent || '').trim().length > 0 && (e.textContent || '').trim().length < 60).slice(0, 120).map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''} = ${(e.textContent || '').trim().replace(/\s+/g, ' ')}`));
    log('\n--- HUD : éléments qui ont changé après 8 s d\'accélérateur ---');
    hud1.forEach((t, i) => { if (t !== hud0[i]) log(`${hud0[i] || '(absent)'}  →  ${t}`); });
    for (const k of ['ArrowUp', 'KeyW']) await page.keyboard.up(k);
  } catch (e) { log('test accélération: échec', e.message); }

  // 2) fréquence d'images (logiciel : valeur relative seulement) + coût JS du rendu
  const fps = await page.evaluate(() => new Promise((res) => {
    const C = window.__captured; const r0 = C ? C.renders : 0; const m0 = C ? C.renderMs : 0; const t = performance.now(); let n = 0;
    (function f() { n++; if (performance.now() - t < 6000) requestAnimationFrame(f); else res({ rafFrames: n, ms: Math.round(performance.now() - t), renderCalls: C ? C.renders - r0 : 0, renderMsTotal: C ? Math.round(C.renderMs - m0) : 0 }); })();
  })).catch(() => null);
  log('\n--- CADENCE (SwiftShader, indicatif) ---', JSON.stringify(fps));

  // 3) profil CPU JS 8 s
  try {
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 500 });
    await client.send('Profiler.start');
    await sleep(8000);
    const { profile } = await client.send('Profiler.stop');
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map();
    profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0)));
    const agg = new Map();
    let total = 0;
    for (const [id, us] of self) {
      const cf = byId.get(id).callFrame;
      total += us;
      const key = `${cf.functionName || '(anonymous)'} @ ${cf.url.split('/').pop() || '-'}:${cf.lineNumber}:${cf.columnNumber}`;
      agg.set(key, (agg.get(key) || 0) + us);
    }
    const rows = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
    log(`\n--- PROFIL CPU JS (8 s, total échantillonné ${(total / 1000).toFixed(0)} ms) ---`);
    for (const [k, us] of rows) log(`${(us / 1000).toFixed(0).padStart(6)} ms  ${k}`);
    // extraits de code des fonctions de l'app les plus coûteuses
    const assets = path.join(root, 'assets');
    log('\n--- CODE DES FONCTIONS LES PLUS COÛTEUSES (bundle app) ---');
    let shown = 0;
    for (const [k] of rows) {
      const m = k.match(/@ (index-[^:]+\.js):(\d+):(\d+)$/);
      if (!m || shown >= 6) continue;
      const lines = fs.readFileSync(path.join(assets, m[1]), 'utf8').split('\n');
      const ln = lines[+m[2]] || '';
      log(`[${k}]\n  ${ln.slice(Math.max(0, +m[3] - 40), +m[3] + 420)}\n`);
      shown++;
    }
  } catch (e) { log('profil CPU: échec', e.message); }

  // 4) réseau
  const tot = done.reduce((s, r) => s + (r.bytes || 0), 0);
  log(`\n--- RÉSEAU : ${done.length} requêtes, ${mo(tot)} transférés ---`);
  for (const r of done.sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 25)) log(`${mo(r.bytes || 0).padStart(10)}  ${r.status}  ${r.url}`);

  // 5) capture + stats de blanc dans le ciel
  try {
    const buf = await page.screenshot({ type: 'png', timeout: 60000 });
    fs.writeFileSync(path.join(outDir, `${prof.name}.png`), buf);
    log('\n--- CAPTURE (pourcentage de pixels quasi blancs par zone) ---', JSON.stringify(await skyStats(buf)));
  } catch (e) { log('capture: échec', e.message); }

  log('\n--- CONSOLE / ERREURS ---\n' + logs.join('\n'));
  await page.close();
}
await browser.close();
server.close();
log('\n=== FIN DIAGNOSTIC RUNTIME ===');
