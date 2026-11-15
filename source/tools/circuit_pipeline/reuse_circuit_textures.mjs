#!/usr/bin/env node
/** Réutilise les textures d'un circuit « donneur » (ex. Monza) pour des matériaux nommés d'un autre circuit (ex. Silverstone).
 *  Usage : node reuse_circuit_textures.mjs <tuiles-cible> <tuiles-donneur>
 *  Les groupes (herbe, gravier) sont reconnus par les noms de matériaux canoniques du jeu : GRASS*, sand_new*.
 *  Pour chaque groupe : couleur de base (image) la plus utilisée par le donneur, plus ses facteurs rugosité / métal / teinte.
 *  Les images sont copiées dans <cible>/tex (WebP + KTX2 s'il existe), tiles.json et ktx2.json sont mis à jour.
 *  Sans donneur exploitable : la cible est laissée telle quelle (code retour 0, message « inchangé »). */
import fs from 'node:fs'
import path from 'node:path'
const [, , target, donor] = process.argv
if (!target || !donor) { console.error('usage: reuse_circuit_textures.mjs <cible> <donneur>'); process.exit(2) }
const rd = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const GROUPS = [
  { id: 'herbe', re: /^GRASS(\.\d+)?$/ },
  { id: 'gravier', re: /^sand_new(\.\d+)?$/ },
]
/** index d'image d'une texture glTF (source directe, ou EXT_texture_webp / KHR_texture_basisu écrits par gltf-transform) */
const srcOf = t => t?.source ?? t?.extensions?.EXT_texture_webp?.source ?? t?.extensions?.KHR_texture_basisu?.source
const baseOf = (g, m) => {
  const bt = m.pbrMetallicRoughness?.baseColorTexture; if (!bt) return null
  const t = g.textures?.[bt.index]; const src = srcOf(t)
  const uri = g.images?.[src]?.uri; return typeof uri === 'string' && uri.startsWith('tex/') ? uri : null
}
// ---- 1. donneur : image + facteurs les plus utilisés par groupe
let dm
try { dm = rd(path.join(donor, 'tiles.json')) } catch { console.log('donneur absent : inchangé'); process.exit(0) }
const votes = Object.fromEntries(GROUPS.map(g => [g.id, new Map()]))
for (const t of dm.tiles) {
  let g; try { g = rd(path.join(donor, t.file)) } catch { continue }
  for (const m of g.materials ?? []) {
    const grp = GROUPS.find(G => G.re.test(m.name ?? '')); if (!grp) continue
    const uri = baseOf(g, m); if (!uri) continue
    const v = votes[grp.id].get(uri) ?? { n: 0, pbr: m.pbrMetallicRoughness }
    v.n++; votes[grp.id].set(uri, v)
  }
}
const pick = {}
for (const G of GROUPS) {
  const best = [...votes[G.id]].sort((a, b) => b[1].n - a[1].n)[0]
  if (best) pick[G.id] = { uri: best[0], pbr: best[1].pbr }
}
if (!Object.keys(pick).length) { console.log('aucune texture herbe/gravier chez le donneur : inchangé'); process.exit(0) }
// ---- 2. cible : remplace la couleur de base des matériaux du groupe
const tm = rd(path.join(target, 'tiles.json'))
const donorKtx = (() => { try { return rd(path.join(donor, 'tex', 'ktx2.json')) } catch { return {} } })()
let targetKtx = null; try { targetKtx = rd(path.join(target, 'tex', 'ktx2.json')) } catch { /* pas de KTX2 */ }
const copied = new Set(); let patched = 0
const usedUris = g => { const out = new Set(); const mats = new Set()
  for (const me of g.meshes ?? []) for (const p of me.primitives ?? []) if (typeof p.material === 'number') mats.add(p.material)
  const add = ti => { if (ti == null) return; const src = srcOf(g.textures?.[ti]); const u = g.images?.[src]?.uri; if (typeof u === 'string' && u.startsWith('tex/')) out.add(u) }
  const walk = o => { if (!o || typeof o !== 'object') return; if (Number.isInteger(o.index) && ('texCoord' in o || 'scale' in o || 'strength' in o || Object.keys(o).length <= 3)) add(o.index); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v) }
  for (const mi of mats) walk(g.materials[mi])
  return [...out] }
for (const t of tm.tiles) {
  const file = path.join(target, t.file); const g = rd(file); let changed = false
  for (const m of g.materials ?? []) {
    const grp = GROUPS.find(G => G.re.test(m.name ?? '')); const p = grp && pick[grp.id]; if (!p) continue
    const bt = m.pbrMetallicRoughness?.baseColorTexture; if (!bt) continue
    g.images = g.images ?? []; g.textures = g.textures ?? []
    const old = g.textures[bt.index] ?? {}
    g.images.push({ uri: p.uri, mimeType: 'image/webp' })
    const ni = g.images.length - 1
    g.textures.push({ ...(old.sampler !== undefined ? { sampler: old.sampler } : {}), ...(old.extensions?.EXT_texture_webp ? { extensions: { EXT_texture_webp: { source: ni } } } : { source: ni }) })
    bt.index = g.textures.length - 1
    const dp = p.pbr ?? {}
    for (const k of ['baseColorFactor', 'roughnessFactor', 'metallicFactor']) if (dp[k] !== undefined) m.pbrMetallicRoughness[k] = dp[k]
    changed = true; patched++
    if (!copied.has(p.uri)) {
      copied.add(p.uri)
      fs.mkdirSync(path.join(target, 'tex'), { recursive: true })
      fs.copyFileSync(path.join(donor, p.uri), path.join(target, p.uri))
      const stem = path.basename(p.uri, '.webp'); const kt = path.join(donor, 'tex', stem + '.ktx2')
      if (fs.existsSync(kt) && targetKtx && donorKtx[stem]) { fs.copyFileSync(kt, path.join(target, 'tex', stem + '.ktx2')); targetKtx[stem] = donorKtx[stem] }
      tm.texSizes = tm.texSizes ?? {}; tm.texSizes[p.uri] = fs.statSync(path.join(target, p.uri)).size
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(g))
}
for (const t of tm.tiles) t.tex = usedUris(rd(path.join(target, t.file)))
if (targetKtx) fs.writeFileSync(path.join(target, 'tex', 'ktx2.json'), JSON.stringify(targetKtx) + '\n')
// ---- 3. images devenues inutiles (repli propre à la cible) : supprimées
const still = new Set(tm.tiles.flatMap(t => t.tex ?? []))
for (const u of Object.keys(tm.texSizes ?? {})) if (!still.has(u)) {
  for (const ext of ['.webp', '.ktx2']) { const f = path.join(target, u.replace(/\.webp$/, ext)); if (fs.existsSync(f)) fs.rmSync(f) }
  const stem = path.basename(u, '.webp'); if (targetKtx) delete targetKtx[stem]; delete tm.texSizes[u]
}
if (targetKtx) fs.writeFileSync(path.join(target, 'tex', 'ktx2.json'), JSON.stringify(targetKtx) + '\n')
fs.writeFileSync(path.join(target, 'tiles.json'), JSON.stringify(tm, null, 1))
console.log(`textures du donneur appliquées : ${Object.entries(pick).map(([k, v]) => k + '=' + v.uri).join(', ')} ; ${patched} matériaux`)
