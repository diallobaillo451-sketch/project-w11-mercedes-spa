// Lot 8 — voitures d'équipe : assets-work/cars/<id>_{hi,lod1,lod2}.glb (Blender, t1_team_car.py) → game/public/cars/
//  hi   : textures KTX2 UASTC (+zstd, RDO), plafond 1024 (2048 pour la livrée cuite), géométrie meshopt
//  lod1 / lod2 : SANS textures (matériaux de même nom que la version hi : le jeu y rebranche les textures déjà chargées
//               → aucune copie GPU), géométrie meshopt
// usage : node tools/team_cars_opt.mjs [id ...]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureBasisu, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { dedup, prune, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'
import fs from 'node:fs'; import { execFileSync } from 'node:child_process'
const W = '/workspace/w11', K = '/workspace/tools/ktx/KTX-Software-4.4.2-Linux-x86_64'
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(W + '/assets-work/cars').filter(f => f.endsWith('_hi.glb')).map(f => f.replace('_hi.glb', ''))
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
const out = {}
for (const id of ids) {
  const rep = out[id] = {}
  for (const q of ['hi', 'lod1', 'lod2']) {
    const src = `${W}/assets-work/cars/${id}_${q}.glb`; if (!fs.existsSync(src)) continue
    const doc = await io.read(src), root = doc.getRoot()
    await doc.transform(dedup(), prune(), weld())
    let gpu = 0
    if (q === 'hi') {
      doc.createExtension(KHRTextureBasisu).setRequired(true)
      const lin = new Set(); for (const m of root.listMaterials()) { for (const t of [m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture()]) if (t) lin.add(t) }
      let i = 0
      for (const t of root.listTextures()) {
        const big = /livery|PAINT/i.test(t.getName() + t.getURI()) || root.listMaterials().some(m => /PAINT/.test(m.getName()) && m.getBaseColorTexture() === t)
        const max = big ? 2048 : 1024
        const img = sharp(Buffer.from(t.getImage())); const md = await img.metadata()
        const s = Math.min(1, max / Math.max(md.width, md.height)), w = Math.max(4, Math.round(md.width * s / 4) * 4), h = Math.max(4, Math.round(md.height * s / 4) * 4)
        const tmp = `/tmp/tc_${id}_${i}.png`, tk = `/tmp/tc_${id}_${i++}.ktx2`
        await img.resize(w, h).png().toFile(tmp)
        const L = lin.has(t)
        execFileSync(K + '/bin/ktx', ['create', '--format', L ? 'R8G8B8A8_UNORM' : 'R8G8B8A8_SRGB', '--assign-tf', L ? 'linear' : 'srgb', '--encode', 'uastc', '--uastc-quality', '2',
          '--uastc-rdo', '--uastc-rdo-l', '1.5', '--zstd', '19', '--generate-mipmap', tmp, tk], { env: { ...process.env, LD_LIBRARY_PATH: K + '/lib' } })
        t.setImage(new Uint8Array(fs.readFileSync(tk))).setMimeType('image/ktx2').setURI('')
        gpu += w * h * 1.33   // ASTC 4×4 = 1 octet/texel
      }
    } else {
      for (const m of root.listMaterials()) { m.setBaseColorTexture(null); m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null) }
      await doc.transform(prune())
    }
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
    const dst = `${W}/game/public/cars/${id}_${q}.glb`; await io.write(dst, doc)
    let tris = 0, prims = 0; for (const me of root.listMeshes()) for (const p of me.listPrimitives()) { prims++; tris += (p.getIndices()?.getCount() ?? 0) / 3 }
    rep[q] = { MB: +(fs.statSync(dst).size / 1e6).toFixed(2), tris, prims, mats: root.listMaterials().length, tex: root.listTextures().length, gpuTexMB: +(gpu / 1e6).toFixed(1) }
  }
  fs.copyFileSync(`${W}/assets-work/cars/${id}.json`, `${W}/game/public/cars/${id}.json`)
  console.log(id, JSON.stringify(rep))
}
