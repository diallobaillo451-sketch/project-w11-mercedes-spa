import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2]); const root = doc.getRoot()
for (const m of root.listMaterials()) { if (!/Helmet_Base|Visor_Strip|Driver_Suit|Driver_Gloves/.test(m.getName())) continue
  for (const [k, t] of [['bc', m.getBaseColorTexture()], ['n', m.getNormalTexture()], ['mr', m.getMetallicRoughnessTexture()]]) if (t) console.log(m.getName(), k, t.getName(), t.getURI(), t.getMimeType(), t.getSize(), t.getImage().byteLength) }
