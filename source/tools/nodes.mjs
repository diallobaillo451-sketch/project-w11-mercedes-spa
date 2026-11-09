import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';import {MeshoptDecoder} from 'meshoptimizer';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(process.argv[2]);
function walk(n,d){const m=n.getMesh();const w=n.getWorldTranslation().map(v=>v.toFixed(3));
 if(d<4||!m) console.log(' '.repeat(d)+n.getName(),w.join(','),m?('mesh:'+m.getName()+' '+m.listPrimitives().map(p=>p.getMaterial()?.getName()).join('|')):'');
 n.listChildren().forEach(c=>walk(c,d+1));}
doc.getRoot().getDefaultScene().listChildren().forEach(n=>walk(n,0));
