// Voiture : textures WebP (≈235 Mo décodées en RGBA + mipmaps) → PNG temporaire, puis KTX2 UASTC pleine résolution (CLI).
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
const [inp, out] = process.argv.slice(2)
await MeshoptDecoder.ready; await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(inp)
let n = 0
for (const t of doc.getRoot().listTextures()) if (t.getMimeType() === 'image/webp') { t.setImage(new Uint8Array(await sharp(Buffer.from(t.getImage())).png().toBuffer())).setMimeType('image/png'); t.setURI(t.getURI().replace(/\.webp$/, '.png')); n++ }
doc.getRoot().listExtensionsUsed().filter(e => e.extensionName === 'EXT_texture_webp').forEach(e => e.dispose())
await io.write(out, doc); console.log('webp→png', n)
