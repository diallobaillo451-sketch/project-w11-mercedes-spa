/* PROJECT W11 — réalisme du rendu (asphalte, bâtiments, herbe, brume, lumière) — module externe, sans toucher au code compilé du jeu.
 *
 *  Chargé par <script src="./w11-look.js"></script> AVANT le bundle du jeu. Il s'accroche à window.__w11 (déjà exposé par le jeu) :
 *   - valeurs par défaut de l'étalonnage (saturation, contraste, exposition, environnement) quand l'URL ne les fixe pas ;
 *   - par circuit (détecté au titre de la page, donc aussi après un changement de circuit à chaud) : exposition, soleil, hémisphère,
 *     brouillard et brume d'horizon (y compris la « base » que le système météo réapplique à chaque image) ;
 *   - par matériau, sur les tuiles déjà chargées et sur celles qui arrivent (ren.onTile) : albédo ramené à des valeurs réelles
 *     (asphalte ~0,08-0,14 linéaire, blancs ≤ 0,80), teinte chaude de l'asphalte, variation de teinte / salissure procédurale en
 *     coordonnées monde (aucune texture, aucune mémoire GPU en plus), herbe et sable teintés selon le climat du circuit.
 *  ?look=0 désactive tout (comparaison avant / après) ; ?look=lite garde couleurs, lumière et brume mais coupe les shaders (téléphone lent) ;
 *  ?look=force applique aussi les réglages globaux à Spa, Monza, Barcelone et Marina. window.__w11look.apply({...}) permet les essais en direct.
 *  Les circuits dont les matériaux n'ont ni classe (extras.w11_class) ni nom reconnu ne sont pas touchés (Spa, Barcelone, Monza, Marina :
 *  leur rendu est déjà réglé). Toute erreur est avalée : au pire, le jeu s'affiche comme avant. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  if (Q.get('look') === '0') return;

  // ───────────────────────────────── 1. étalonnage par défaut (lu par le jeu à sa construction) ─────────────────────────────────
  var UNTOUCHED = { spa: 1, barcelona: 1, monza: 1, marina: 1 };
  var DEF = { exp: '0.80', sat: '1.12', con: '1.14', env: '0.50', hemi: '0.10' };
  function initialCircuit() {
    var c = Q.get('circuit'); if (c) return c;
    try { c = localStorage.getItem('w11.circuit'); } catch (e) { c = null; }
    return c || 'spa';
  }
  try {
    if (!UNTOUCHED[initialCircuit()] || Q.get('look') === 'force') {
      var changed = false;
      Object.keys(DEF).forEach(function (k) { if (!Q.has(k)) { Q.set(k, DEF[k]); changed = true; } });
      if (changed) history.replaceState(history.state, '', location.pathname + '?' + Q.toString() + location.hash);
    }
  } catch (e) { /* tant pis */ }

  // ───────────────────────────────── 2. réglages par circuit ─────────────────────────────────
  // fog : [r, g, b] linéaires (avant tone mapping) · fogD : multiplicateur de densité · haze : brume d'horizon du ciel (0,35 d'origine)
  // sun : [r, g, b] couleur de la lumière directe · sunI : multiplicateur · hemi : multiplicateur · envI : multiplicateur · expo : multiplicateur d'exposition
  // mats : par classe w11 → k : [r, g, b] multiplicateur d'albédo, rough : rugosité minimale, spec : multiplicateur d'envMapIntensity
  var COOL = [0.96, 0.98, 1.0], WARM = [1.0, 0.93, 0.82];
  var P = {
    _defaut: { sat: 1.12, con: 1.14, fog: [0.62, 0.68, 0.76], fogD: 1.0, haze: 0.30, sun: [1.0, 0.94, 0.85], sunI: 1.08, hemi: 1.0, envI: 0.80, expo: 0.92,
      mats: { road: { k: [0.62, 0.60, 0.56], rough: 0.93, spec: 0.55 }, kerb: { k: [0.95, 0.93, 0.92] }, carpet: { k: [0.80, 0.80, 0.80] },
        grass: { k: [0.90, 0.98, 0.78] }, gravel: { k: [0.90, 0.88, 0.84] }, trees: { k: [0.88, 0.95, 0.82] },
        other: { hi: [0.50, 0.30, 0.55] }, barrier: { hi: [0.50, 0.22, 0.30], rough: 0.82 } } },
    sepang: { fog: [0.76, 0.78, 0.80], fogD: 3.0, haze: 0.44, sun: [1.0, 0.95, 0.86], mats: { road: { k: [0.634, 0.610, 0.567] }, grass: { k: [0.78, 0.98, 0.62] }, trees: { k: [0.80, 0.98, 0.72] } } },
    silverstone: { fog: [0.70, 0.74, 0.80], fogD: 2.2, haze: 0.38, sun: [0.98, 0.95, 0.90], sunI: 1.0, mats: { road: { k: [1.229, 1.117, 0.849] }, grass: { k: [0.82, 0.98, 0.70] } } },
    albertpark: { fog: [0.70, 0.78, 0.90], fogD: 2.2, mats: { road: { k: [0.717, 0.670, 0.570] }, grass: { k: [0.85, 1.0, 0.72] } } },
    hungaroring: { fog: [0.82, 0.78, 0.68], fogD: 2.4, haze: 0.40, sun: [1.0, 0.92, 0.78], mats: { road: { k: [0.694, 0.667, 0.620] }, grass: { k: [1.05, 0.98, 0.62] } } },
    redbull: { fog: [0.68, 0.78, 0.92], fogD: 1.8, haze: 0.26, mats: { road: { k: [0.479, 0.461, 0.429] }, grass: { k: [0.78, 1.0, 0.66] } } },
    imola: { fog: [0.72, 0.78, 0.86], fogD: 2.4, mats: { road: { k: [0.936, 0.900, 0.837] }, grass: { k: [0.88, 1.0, 0.74] } } },
    bahrain: { fog: [0.88, 0.80, 0.66], fogD: 2.8, haze: 0.48, sun: [1.0, 0.88, 0.72], sunI: 1.04, mats: { road: { k: [0.505, 0.486, 0.452] } } },
    interlagos: { fog: [0.74, 0.78, 0.82], fogD: 3.0, haze: 0.42, sun: [1.0, 0.94, 0.84], mats: { road: { k: [0.620, 0.600, 0.560] }, grass: { k: [0.82, 1.0, 0.68] } } },
  };
  // UNTOUCHED (plus haut) : circuits dont le rendu est déjà soigné ; ni lumière, ni brume, ni matériaux ne sont modifiés
  var NAMES = [['albert park', 'albertpark'], ['hungaroring', 'hungaroring'], ['red bull', 'redbull'], ['imola', 'imola'], ['bahrain', 'bahrain'], ['sepang', 'sepang'],
    ['silverstone', 'silverstone'], ['interlagos', 'interlagos'], ['spa-francorchamps', 'spa'], ['monza', 'monza'], ['barcelone', 'barcelona'], ['catalogne', 'barcelona'], ['marina', 'marina']];
  var IDS = { spa: 1, monza: 1, barcelona: 1, sepang: 1, silverstone: 1, marina: 1, redbull: 1, bahrain: 1, hungaroring: 1, interlagos: 1, imola: 1, albertpark: 1 };
  function circuitKey() {   // identifiant du registre : paramètre ?circuit= (mis à jour par le jeu à chaque changement à chaud), sinon stockage local, sinon titre de la page
    var c = new URLSearchParams(location.search).get('circuit');
    if (c && IDS[c]) return c;
    try { c = localStorage.getItem('w11.circuit'); if (c && IDS[c]) return c; } catch (e) { /* stockage indisponible */ }
    var t = (document.title || '').toLowerCase();
    for (var i = 0; i < NAMES.length; i++) if (t.indexOf(NAMES[i][0]) >= 0) return NAMES[i][1];
    return null;
  }
  function merge(a, b) { // fusion profonde (b l'emporte)
    var o = {}; Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; });
    Object.keys(b || {}).forEach(function (k) { o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object' && !Array.isArray(a[k])) ? merge(a[k], b[k]) : b[k]; });
    return o;
  }

  // ───────────────────────────────── 3. classes de matériaux ─────────────────────────────────
  // classes w11 (extras.w11_class : Sepang et les circuits reconvertis) ; à défaut, noms de matériaux de la famille Silverstone
  var NAME_RULES = [
    ['road', /^(asph|asphalt|road|tarmac|groove|rubber)/i], ['kerb', /^(kerb|curb)/i], ['grass', /^grass/i], ['gravel', /^(sand|gravel)/i],
    ['trees', /^(tree|bush|leaf|hedge)/i], ['barrier', /^(concrete-barrie|tyreswall|fence|barrier|armco|guardrail)/i],
    ['other', /^(structures|gstands|box\d|misc|gazebo|bridges|newbridge|houses|building|garage|paddock|tower|roof|hangar)/i]
  ];
  function classOf(mt) {
    var ud = mt.userData || {};
    if (ud.w11_class) return ud.w11_class;
    var n = (ud.w11_src || mt.name || '').replace(/\.\d+$/, '');
    for (var i = 0; i < NAME_RULES.length; i++) if (NAME_RULES[i][1].test(n)) return NAME_RULES[i][0];
    return null;
  }

  // ───────────────────────────────── 4. shader : blancs ramenés à un albédo réel + salissure monde ─────────────────────────────────
  // uniforme w11K = (seuil, amplitude du rolloff, salissure, 0) ; la teinte chaude / froide vient de la couleur du matériau
  var CHUNK_V = '#include <common>\nvarying vec3 w11P; varying vec3 w11N;';
  var CHUNK_VP = '#include <project_vertex>\n{ vec4 w11p = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n w11p = instanceMatrix * w11p;\n#endif\n w11P = (modelMatrix * w11p).xyz; w11N = normalize(mat3(modelMatrix) * objectNormal); }';
  var CHUNK_F = '#include <common>\nvarying vec3 w11P; varying vec3 w11N; uniform vec4 w11K;\n' +
    'float w11h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
    'float w11n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(w11h(i), w11h(i + vec2(1.0, 0.0)), f.x), mix(w11h(i + vec2(0.0, 1.0)), w11h(i + vec2(1.0, 1.0)), f.x), f.y); }';
  var CHUNK_FM = '#include <map_fragment>\n{\n' +
    '  float L = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n' +
    '  float over = smoothstep(w11K.x, 0.95, L);                                   // les blancs d\'albédo (> 0,8) n\'existent pas : rolloff doux\n' +
    '  diffuseColor.rgb *= 1.0 - w11K.y * over;\n' +
    '  vec2 hp = vec2(w11P.x + w11P.z * 0.7, w11P.z - w11P.x * 0.3);\n' +
    '  float big = w11n(hp * 0.04) * 0.6 + w11n(hp * 0.19 + w11P.y * 0.1) * 0.4;     // taches, reprises de peinture\n' +
    '  float streak = w11n(vec2((w11P.x + w11P.z) * 2.1, w11P.y * 0.12)) * w11n(vec2((w11P.x - w11P.z) * 0.8, w11P.y * 0.05));\n' +
    '  float up = smoothstep(0.6, 0.95, w11N.y);\n' +
    '  float g = (1.0 - 0.10 * w11K.z * (1.0 - big)) * (1.0 - 0.20 * w11K.z * streak * (1.0 - up)) * (1.0 - 0.12 * w11K.z * up * w11n(hp * 0.7));\n' +
    '  diffuseColor.rgb *= g * mix(vec3(1.0), vec3(1.0, 0.975, 0.93), 0.55 * big * w11K.z);\n' +
    '}';
  // asphalte : patchs de teinte basse fréquence (usure, reprises) + grain fin qui s'estompe avec la distance
  var CHUNK_FM_ROAD = '#include <map_fragment>\n{\n' +
    '  vec2 rp = w11P.xz;\n' +
    '  float rb = w11n(rp * 0.05) * 0.55 + w11n(rp * 0.31 + 7.0) * 0.45;\n' +
    '  float rd = length(w11P - cameraPosition);\n' +
    '  float rf = w11n(rp * 3.4) * (1.0 - smoothstep(25.0, 70.0, rd));\n' +
    '  diffuseColor.rgb *= 1.0 + w11K.z * ((rb - 0.5) * 0.34 + (rf - 0.5) * 0.18);\n' +
    '  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), w11K.z * (rb - 0.2));\n' +
    '}';
  var LITE = Q.get('look') === 'lite';
  function inject(mt, kind) {
    if (LITE || mt.userData.w11sh === kind) return;
    var prev = mt.onBeforeCompile, prevKey = mt.customProgramCacheKey;
    var U = mt.userData.w11U || (mt.userData.w11U = { value: { x: 0.55, y: 0.25, z: 0.5, w: 0 } });
    mt.userData.w11sh = kind;
    mt.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(mt, sh, r);
      sh.uniforms.w11K = U;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', CHUNK_V).replace('#include <project_vertex>', CHUNK_VP);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', CHUNK_F).replace('#include <map_fragment>', kind === 'road' ? CHUNK_FM_ROAD : CHUNK_FM);
    };
    mt.customProgramCacheKey = function () { return (prevKey ? prevKey.call(mt) : '') + '|w11' + kind; };
    mt.needsUpdate = true;
  }

  // ───────────────────────────────── 5. application ─────────────────────────────────
  var ren = null, cur = null, state = { key: null, over: null };
  function profile(key, over) {
    var base = P._defaut, prof = merge(base, P[key] || {});
    return over ? merge(prof, over) : prof;
  }
  function gradeMaterial(mt, prof) {
    if (!mt || !mt.isMeshStandardMaterial || !mt.color) return;
    var cls = classOf(mt); if (!cls) return;
    var c = prof.mats && prof.mats[cls]; if (!c) return;
    var ud = mt.userData; if (!ud.w11o) ud.w11o = { r: mt.color.r, g: mt.color.g, b: mt.color.b, rough: mt.roughness, env: mt.envMapIntensity === undefined ? 1 : mt.envMapIntensity };
    var o = ud.w11o, k = c.k || [1, 1, 1];
    // PBR : un matériau glTF sans metallicFactor est un MÉTAL pur (valeur par défaut = 1) ; béton, arbres, herbe, asphalte, barrières ne le sont pas.
    // Une toiture « métal » rugueuse ne fait que refléter le ciel : surface blanc-bleu uniforme, sans ombre ni nuance.
    if (o.metal === undefined) { o.metal = mt.metalness; o.srcn = (ud.w11_src || mt.name || ''); }
    var nm = o.srcn, glassy = /glass|window|mirror|chrome|steel|alu|metal|light|lamp|led\b|screen|display|decal|visor|cockpit/i.test(nm);
    if (mt.metalness !== undefined && !mt.metalnessMap) mt.metalness = (cls === 'other' ? (glassy ? o.metal : Math.min(o.metal, 0.05)) : 0);
    if (cls === 'other' && !glassy && mt.roughness !== undefined && !mt.roughnessMap) mt.roughness = Math.max(o.rough, c.roughMin != null ? c.roughMin : 0.62);
    if (cls === 'other' && mt.roughness !== undefined && o.rough < 0.3 && !mt.roughnessMap && glassy) mt.envMapIntensity = o.env * 0.55;
    mt.color.r = o.r * k[0]; mt.color.g = o.g * k[1]; mt.color.b = o.b * k[2];
    if (c.rough != null) mt.roughness = Math.max(o.rough, c.rough);
    if (c.spec != null) mt.envMapIntensity = o.env * c.spec;
    if (cls === 'road') { var U = ud.w11U || (ud.w11U = { value: { x: 0.55, y: 0.25, z: 0.5, w: 0 } }); U.value.z = c.dirt != null ? c.dirt : 0.9; inject(mt, 'road'); }
    else if (c.hi) { var U2 = ud.w11U || (ud.w11U = { value: { x: 0.55, y: 0.25, z: 0.5, w: 0 } }); U2.value.x = c.hi[0]; U2.value.y = c.hi[1]; U2.value.z = c.hi[2]; inject(mt, 'wall'); }
  }
  function gradeTree(root, prof) {
    root.traverse(function (o) {
      if (!o.isMesh) return; var m = o.material;
      (Array.isArray(m) ? m : [m]).forEach(function (mt) { try { gradeMaterial(mt, prof); } catch (e) { /* matériau étranger */ } });
    });
  }
  function atmosphere(prof) {
    var sc = ren.scene, key = state.key;
    // lumière directe
    if (!ud0.sun) ud0.sun = { i: ren.sun.intensity, r: ren.sun.color.r, g: ren.sun.color.g, b: ren.sun.color.b };
    var s = prof.sun || [1, 1, 1]; ren.sun.color.r = s[0]; ren.sun.color.g = s[1]; ren.sun.color.b = s[2];
    var X = ren.wx && ren.wx.base;   // la météo réapplique ces valeurs de base à chaque image : on corrige la base elle-même
    var sunI = ud0.sun.i * (prof.sunI || 1), envI = ud0.env * (prof.envI || 1), hemiI = ud0.hemi * (prof.hemi || 1);
    var fog = sc.fog;
    var fogDen = ud0.fogD * (prof.fogD || 1);
    var fogC = prof.fog;
    if (fog) { if (X) { X.fog = fogDen; X.fogC.r = fogC[0]; X.fogC.g = fogC[1]; X.fogC.b = fogC[2]; } fog.density = fogDen; fog.color.r = fogC[0]; fog.color.g = fogC[1]; fog.color.b = fogC[2]; }
    if (ren.dome) {
      var u = ren.dome.mat.uniforms; var hz = prof.haze != null ? prof.haze : ud0.haze;
      u.uHaze.value = hz; if (X) X.haze = hz;
      u.uFog.value.x = fogC[0]; u.uFog.value.y = fogC[1]; u.uFog.value.z = fogC[2];
    }
    ren.sun.intensity = sunI; sc.environmentIntensity = envI; ren.hemi.intensity = hemiI;
    if (X) { X.sun = sunI; X.env = envI; X.hemi = hemiI; }
    ren.r.toneMappingExposure = ud0.expo * (prof.expo || 1);
  }
  var ud0 = {};
  function capture() {
    ud0 = { sun: null, env: ren.scene.environmentIntensity, hemi: ren.hemi.intensity, fogD: ren.scene.fog ? ren.scene.fog.density : 0.00032,
      haze: ren.dome ? ren.dome.mat.uniforms.uHaze.value : 0.35, expo: ren.r.toneMappingExposure };
    ud0.sun = { i: ren.sun.intensity, r: ren.sun.color.r, g: ren.sun.color.g, b: ren.sun.color.b };
    var f = ren.scene.fog; ud0.fogC = f ? [f.color.r, f.color.g, f.color.b] : [0.6, 0.65, 0.7];
  }
  function applyAll(key, over) {
    state.key = key; state.over = over || null;
    var prof = profile(key, over); cur = prof;
    if ((UNTOUCHED[key] || !key) && !over) {   // rendu d'origine : on remet les réglages capturés (cas d'un changement de circuit à chaud)
      prof = { sat: 1.0, con: 1.06, fog: ud0.fogC, fogD: 1, haze: ud0.haze, sun: [ud0.sun.r, ud0.sun.g, ud0.sun.b], sunI: 1, hemi: 1, envI: 1, expo: 1, mats: {} };
      atmosphere(prof); return prof;
    }
    atmosphere(prof);
    gradeTree(ren.scene, prof);
    // étalonnage global (passe de post-traitement : saturation, contraste) si le jeu l'expose
    try {
      var C = ren.composer; if (C && C.passes) C.passes.forEach(function (p) { if (p.uniforms && p.uniforms.sat && p.uniforms.con) { if (prof.sat != null) p.uniforms.sat.value = prof.sat; if (prof.con != null) p.uniforms.con.value = prof.con; } });
    } catch (e) { /* pas de composer */ }
    return prof;
  }
  function boot(R) {
    ren = R;
    try {
      capture();
      var prevTile = ren.onTile;
      ren.onTile = function (root) { try { if (cur && !(UNTOUCHED[state.key] && !state.over)) gradeTree(root, cur); } catch (e) { /* ignoré */ } if (prevTile) prevTile.call(ren, root); };
      var k = circuitKey(); applyAll(k, null);
      setInterval(function () { var k2 = circuitKey(); if (k2 && k2 !== state.key) { try { applyAll(k2, null); } catch (e) { /* ignoré */ } } }, 700);
    } catch (e) { if (window.console) console.warn('w11-look', e); }
  }
  var tries = 0, t = setInterval(function () {
    var W = window.__w11; tries++;
    if (W && W.ren && W.ren.scene && W.ren.sun && W.ren.hemi) { clearInterval(t); boot(W.ren); }
    else if (tries > 600) clearInterval(t);
  }, 200);
  window.__w11look = { apply: function (over) { return applyAll(circuitKey(), over); }, profile: profile, key: circuitKey, P: P, state: state, reset: function () { try { applyAll(circuitKey(), { mats: {}, sun: [1, 1, 1], fog: cur ? cur.fog : [0.6, 0.65, 0.7] }); } catch (e) { /* */ } } };
})();
