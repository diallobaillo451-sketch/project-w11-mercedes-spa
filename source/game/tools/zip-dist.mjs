// Zip de dist/ → ../out/PROJECT_W11_dist.zip (fflate, gratuit) + copie dist → ../out/dist
import fs from 'node:fs'; import path from 'node:path'; import { zipSync } from 'fflate'
const root = new URL('..', import.meta.url).pathname, dist = path.join(root, 'dist'), out = path.join(root, '../out')
const files = {}
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else { const rel = 'PROJECT_W11/' + path.relative(dist, p); const ext = path.extname(f); files[rel] = [fs.readFileSync(p), { level: ['.glb', '.png', '.jpg', '.m4a', '.mp3', '.ogg', '.bin'].includes(ext) ? 0 : 6 }] } } }
walk(dist)
fs.writeFileSync(path.join(out, 'PROJECT_W11_dist.zip'), zipSync(files))
fs.rmSync(path.join(out, 'dist'), { recursive: true, force: true }); fs.cpSync(dist, path.join(out, 'dist'), { recursive: true })
console.log('zip', (fs.statSync(path.join(out, 'PROJECT_W11_dist.zip')).size / 1e6).toFixed(1), 'Mo,', Object.keys(files).length, 'fichiers')
