// Lecture seule : imprime les zones utiles du bundle de l'application (pas three.js) pour préparer les correctifs.
import fs from 'node:fs';
import path from 'node:path';
const pub = process.argv[2] || 'public';
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const entry = (html.match(/src=["'][^"']*\/assets\/([^"']+\.js)["']/) || [])[1];
const src = fs.readFileSync(path.join(pub, 'assets', entry), 'utf8');
console.log('bundle', entry, src.length, 'octets');
const APP0 = src.indexOf('var Ff=performance.now()');
console.log('début du code applicatif @', APP0);
const show = (title, start, len) => console.log(`\n##### ${title} [@${Math.max(0, start)}..${Math.max(0, start) + len}] #####\n` + src.slice(Math.max(0, start), Math.max(0, start) + len));
const find = (needle, from = 0) => { const i = src.indexOf(needle, from); if (i < 0) console.log(`\n##### ${needle} : INTROUVABLE #####`); return i; };
const occ = (needle, n, before, after, from = APP0) => {
  let i = from, k = 0;
  while (k < n && (i = src.indexOf(needle, i)) >= 0) { show(`${needle} #${k + 1}`, i - before, before + after); i += needle.length; k++; }
  if (k === 0) console.log(`\n##### ${needle} : aucune occurrence #####`);
};
// index des déclarations de l'application
const idx = [];
for (const m of src.slice(APP0).matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*class|(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) idx.push(`${m[1] || m[2]}@${APP0 + m.index}`);
console.log('\n##### INDEX des classes/fonctions du code applicatif #####\n' + idx.join('  '));
let i;
i = find('drawDistance:5e3'); if (i >= 0) show('PRÉRÉGLAGES QUALITÉ (wp)', i - 2800, 4300);
i = find('var Ep=[[1,0]'); if (i >= 0) show('ÉCHELLE ADAPTATIVE (Ep, Dp)', i, 2600);
i = find('buildSky(){'); if (i >= 0) show('buildSky()', i, 6500);
i = find('async load(e,t,n){this.buildSky()'); if (i >= 0) show('load() du moteur de rendu', i, 8000);
i = find('async loadTile('); if (i >= 0) show('loadTile()', i, 3000);
i = find('_m=class{ctx=null'); if (i >= 0) show('CLASSE AUDIO _m', i, 12500);
i = find('steerKnob`).style.setProperty'); if (i >= 0) show('BOUCLE PRINCIPALE (fin)', i - 9000, 9600);
i = find('async function _h(){'); if (i >= 0) show('_h() démarrage', i, 5500);
i = find('gu=class{N;ND;D0;DS'); if (i >= 0) show('classe surface (gu)', i, 3800);
i = find('zu=class{surface;setup=Iu()'); if (i >= 0) show('classe voiture (zu) : début', i, 3200);
for (const t of ['hLap', 'hLast', 'hBest', 'toast', 'sector', 'lapTime', 'bestLap', 'drsAvailable', 'timetrial', 'practice']) occ(t, 2, 500, 900);
console.log('\n=== FIN DU DUMP ===');
