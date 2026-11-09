// Optimisation voiture : node opt_car.mjs in.glb out.glb maxTex [simplifyRatio]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, join, flatten, textureCompress, meshopt, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [,, inp, out, maxT='2048', ratio='1'] = process.argv;
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc = await io.read(inp);
const T = [dedup(), prune(), weld(), join({ keepNamed: false })];
if (+ratio < 1) T.push(simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: 0.0015, lockBorder: true }));
// 2048 seulement pour livrée/châssis/aileron/décals/casque ; le reste en maxT/2
const HIM = /^(decals|merc1|MERCEDES_PAINT|car_chassis|Car_wing|Helmet_Base|Helmet_Visor_Strip)(\.\d+)?$/;
doc.getRoot().listTextures().forEach((t, i) => {
  const hi = t.listParents().some(m => m.propertyType === 'Material' && HIM.test(m.getName()) && m.getBaseColorTexture() === t);
  t.setName((hi ? 'HI_' : 'LO_') + i);
});
T.push(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [+maxT, +maxT], pattern: /^HI_/ }),
       textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86, resize: [+maxT/2, +maxT/2], pattern: /^LO_/ }), prune(),
       meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await doc.transform(...T);
await io.write(out, doc);
const r = doc.getRoot(); let tris = 0, prims = 0;
for (const m of r.listMeshes()) for (const p of m.listPrimitives()) { prims++; tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; }
let gpu = 0; for (const t of r.listTextures()) { const s = await sharp(Buffer.from(t.getImage())).metadata(); gpu += s.width * s.height * 4 * 1.33; }
console.log(JSON.stringify({ out, nodes: r.listNodes().length, meshes: r.listMeshes().length, prims, tris, mats: r.listMaterials().length, tex: r.listTextures().length, gpuMB: +(gpu/1e6).toFixed(0), anims: r.listAnimations().map(a => a.getName()), skins: r.listSkins().length }));
