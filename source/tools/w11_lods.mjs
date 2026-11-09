// Lot 8 — W11 pour l'IA : LOD1 / LOD2 sans pilote ni textures (matériaux de même nom → textures de la version haute partagées)
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { dedup, prune, weld, simplify, join, flatten } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer'
import fs from 'node:fs'
const W = '/workspace/w11'
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
for (const [q, ratio, err] of [['lod1', 0.3, 0.004], ['lod2', 0.07, 0.02]]) {
  const doc = await io.read(W + '/game/public/assets/w11_lh2020_high.glb'), root = doc.getRoot()
  const kill = n => { for (const c of n.listChildren()) kill(c); n.dispose() }
  for (const n of root.listNodes()) { if (n.isDisposed()) continue
    const nm = n.getName()
    if (/^(DRV_rig|STEERING_WHEEL)$/.test(nm) || n.getSkin() || /BLUR|Helmet|Driver|Glove|HANS|Comms|Balaclava|Visor/i.test(nm)) kill(n)
    else if (q === 'lod2' && /_hub_|Caliper/i.test(nm)) kill(n) }
  for (const s of root.listSkins()) s.dispose(); for (const a of root.listAnimations()) a.dispose()
  for (const m of root.listMaterials()) { m.setBaseColorTexture(null); m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null) }
  await doc.transform(prune(), dedup(), weld(), ...(q === 'lod2' ? [flatten()] : []), join({ keepNamed: false }), simplify({ simplifier: MeshoptSimplifier, ratio, error: err }), prune())
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const dst = `${W}/game/public/cars/mercedes_${q}.glb`; await io.write(dst, doc)
  let tris = 0, prims = 0; for (const me of root.listMeshes()) for (const p of me.listPrimitives()) { prims++; tris += (p.getIndices()?.getCount() ?? 0) / 3 }
  console.log(q, (fs.statSync(dst).size / 1e6).toFixed(2), 'MB', tris, 'tris', prims, 'prims', root.listNodes().filter(n => /^W_/.test(n.getName())).map(n => n.getName()).join(','))
}
