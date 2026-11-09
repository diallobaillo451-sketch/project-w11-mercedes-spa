import { NodeIO } from '@gltf-transform/core';import { ALL_EXTENSIONS } from '@gltf-transform/extensions';import { MeshoptDecoder } from 'meshoptimizer';import sharp from 'sharp';
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const d=await io.read(process.argv[2]);
for(const t of d.getRoot().listTextures()){const s=await sharp(Buffer.from(t.getImage())).metadata(); if(s.width*s.height<1e6) continue;
 const users=t.listParents().filter(p=>p.propertyType==='Material').map(m=>m.getName()+(m.getBaseColorTexture()===t?'[bc]':m.getNormalTexture()===t?'[n]':m.getMetallicRoughnessTexture()===t?'[mr]':m.getEmissiveTexture()===t?'[e]':'[?]'));
 console.log(s.width+'x'+s.height, users.join(','));}
