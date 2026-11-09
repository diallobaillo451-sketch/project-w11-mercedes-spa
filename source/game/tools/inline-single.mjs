// Fichier HTML UNIQUE (tout inclus) : dist/index.html + JS + CSS + ressources (piste « low » (simplifiée, AO cuite), voiture « low », audio, surface)
// encodées en base64 et servies par un petit « shim » de fetch(). Résultat : out/PROJECT_W11_single.html
// Avertissement : ~47 Mo, lourd pour Safari iOS (mémoire) ; la version dist/ (servie en HTTPS) reste la voie recommandée.
import fs from 'node:fs'
import path from 'node:path'
const dir = 'dist'
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, f) => `<style>${fs.readFileSync(path.join(dir, f), 'utf8')}</style>`)
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '').replace(/<link rel="manifest"[^>]*>/g, '')
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/g, `<link rel="apple-touch-icon" href="data:image/png;base64,${fs.readFileSync('public/icons/icon-180.png').toString('base64')}">`)
html = html.replace(/<link rel="icon"[^>]*>/g, () => `<link rel="icon" href="data:image/png;base64,${fs.readFileSync('public/icons/icon-192.png').toString('base64')}">`)
let mainJs = ''
html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g, (_, f) => { mainJs = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\/script/gi, '<\\/script'); return '<!--MAIN-->' })
// ressources embarquées
const files = { 'track/surface.json': 'public/track/surface.json', 'track/surface.bin': 'public/track/surface.bin',
  'assets/spa_low.glb': 'public/assets/spa_low.glb', 'assets/w11_lh2020_low.glb': 'public/assets/w11_lh2020_low.glb' }
for (const f of fs.readdirSync('public/audio/engine')) files['audio/engine/' + f] = 'public/audio/engine/' + f
const alias = { 'assets/w11_lh2020_high.glb': 'assets/w11_lh2020_low.glb' }
let blobs = '', i = 0; const map = {}
for (const [k, f] of Object.entries(files)) { const id = 'r' + (i++); map[k] = id; blobs += `<script type="application/octet-stream" id="${id}">${fs.readFileSync(f).toString('base64')}</script>\n` }
const shim = `<script>(()=>{const M=${JSON.stringify(map)},A=${JSON.stringify(alias)},F=window.fetch.bind(window),C={};
window.__W11_SINGLE=true;
window.fetch=function(u,o){const s=String(u&&u.url||u).replace(/^\\.\\//,'').replace(/^.*\\/(?=(assets|track|audio)\\/)/,'');const k=A[s]||s;const id=M[k];
if(!id)return F(u,o);if(!C[id]){const el=document.getElementById(id);C[id]=F('data:application/octet-stream;base64,'+el.textContent).then(r=>r.arrayBuffer());}
return C[id].then(b=>new Response(b.slice(0),{status:200,headers:{'content-type':k.endsWith('.json')?'application/json':'application/octet-stream'}}))};})()</script>`
html = html.replace('<!--MAIN-->', '')
html = html.replace('</body>', () => `${blobs}${shim}<script type="module">${mainJs}</script></body>`) // fonction : évite l'interprétation de $& / $' du JS minifié
fs.mkdirSync('../out', { recursive: true })
const out = '../out/PROJECT_W11_single.html'
fs.writeFileSync(out, html)
console.log(out, (fs.statSync(out).size / 1e6).toFixed(1), 'Mo')
