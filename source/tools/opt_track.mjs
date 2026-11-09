// Optimisation piste : alpha modes, dédup, WebP, meshopt. Usage: node opt_track.mjs in.glb out.glb maxTex [ratioSimplif]
// ratioSimplif (option, ex. 0.5) : simplification meshopt des décors (sols/bordures/lignes exclus : couches coplanaires) → version « low » iPhone
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, meshopt, quantize, reorder, resample, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [,, inp, out, maxT='2048', ratio='0'] = process.argv;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc = await io.read(inp);
const MASK = /^(bushesB|fence2_at|fences|metal_beam|structures|transp-alpha_test|trees1_2022|trees2_2022|treesline|grilles|grille|hedge|flags?)(\.\d+)?$/;
const BLEND = /^(groove1|groove2|groove3|groove_custom|asph_patch_joint|Glass|Glass-blend|LED_Display)(\.\d+)?$/;
const HI = /^(asph|asph_new|kerb_new|CURB_B|line|carpet|carpet-full|grass-side1|GRASS|sand|sand_new|trees1_2022|trees2_2022|barriers|grails|metals1|objects1)(\.\d+)?$/;
const hiTex = new Set();
for (const m of doc.getRoot().listMaterials()) {
  const n = m.getName();
  if (MASK.test(n)) { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.5); }
  else if (BLEND.test(n)) { m.setAlphaMode('BLEND'); }
  else if (m.getAlphaMode() === 'BLEND') { console.log('BLEND->OPAQUE?', n); }
  if (HI.test(n)) for (const t of [m.getBaseColorTexture(), m.getNormalTexture()]) if (t) hiTex.add(t);
}
await doc.transform(dedup(), prune(), weld());
const GROUND = /^(asph|asph_new|asph-grv|asph_pitlane_old|asph-pitlane-old|asph-pitlane-old-red|road-ext-tile|groove\d?|groove_custom|line|doted_line|kerb_new|CURB_B|carpet|carpet-full|carpet-blue|grass-side1|GRASS|sand|sand_new|Parking|new_AO|asph_patch_joint|diss2)(\.\d+)?$/;
if (+ratio > 0) {
  await MeshoptSimplifier.ready; let before = 0, after = 0, n = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial(); if (mat && GROUND.test(mat.getName())) continue;
    const idx = prim.getIndices(); if (!idx || idx.getCount() < 300) continue;
    before += idx.getCount() / 3; simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: +ratio, error: 0.004, lockBorder: true });
    after += prim.getIndices().getCount() / 3; n++;
  }
  await doc.transform(prune());
  console.log('simplify', n, 'prims', Math.round(before), '->', Math.round(after), 'tris');
}
const all = doc.getRoot().listTextures();
const lo = all.filter(t => !hiTex.has(t));
// renommer pour cibler par motif
all.forEach((t,i)=>t.setName((hiTex.has(t)?'HI_':'LO_')+i));
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [+maxT, +maxT], pattern: /^HI_/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [+maxT/2, +maxT/2], pattern: /^LO_/ }),
  reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^(NORMAL|TEXCOORD|TANGENT|COLOR)/ }),
);
// positions laissées en float32 (précision mm nécessaire pour l'ordre des couches) ; compression meshopt mode FILTER
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, doc);
let tex=0; for (const t of doc.getRoot().listTextures()) tex += t.getImage().byteLength;
console.log('textures', all.length, 'hi', hiTex.size, 'texMB', (tex/1e6).toFixed(1));
let gpu=0; const dims=[];
for (const t of doc.getRoot().listTextures()) { const s=await sharp(Buffer.from(t.getImage())).metadata(); gpu+=s.width*s.height*4*1.33; dims.push(s.width+'x'+s.height); }
const c={}; dims.forEach(d=>c[d]=(c[d]||0)+1); console.log('dims',c,'GPU MB',(gpu/1e6).toFixed(0));
