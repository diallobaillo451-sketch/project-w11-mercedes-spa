import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read('public/assets/w11_lh2020_high.glb')
const sw = doc.getRoot().listNodes().find(n => n.getName() === 'STEERING_WHEEL')
console.log('sw T', sw.getTranslation(), 'R', sw.getRotation(), 'S', sw.getScale())
const walk = (n, d) => { const m = n.getMesh(); console.log(' '.repeat(d) + n.getName(), m ? m.listPrimitives().map(p => p.getMaterial()?.getName() + ':' + p.getIndices()?.getCount() / 3 + ' tex ' + (p.getMaterial()?.getBaseColorTexture()?.getName() || p.getMaterial()?.getBaseColorTexture()?.getURI() || '') + ' ' + JSON.stringify(p.getMaterial()?.getBaseColorTexture()?.getSize?.())).join(' | ') : '', n.getTranslation()); n.listChildren().forEach(c => walk(c, d + 1)) }
walk(sw, 0)
for (const nm of ['Object_37', 'Object_41', 'Object_35', 'Object_36', 'Object_45']) {
  const n = sw.listChildren().find(c => c.getName() === nm), p = n.getMesh().listPrimitives()[0]
  const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0'), t = n.getTranslation(), r = n.getRotation(), s = n.getScale()
  let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9]; const e = []
  for (let i = 0; i < pos.getCount(); i++) { const v = pos.getElement(i, []); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]) } if (pos.getCount() <= 8) e.push(v.map(x=>+x.toFixed(4)).join(',') + ' uv ' + (uv ? uv.getElement(i, []).map(x=>+x.toFixed(3)).join(',') : '')) }
  console.log(nm, 'T', t.map(x=>+x.toFixed(4)), 'R', r.map(x=>+x.toFixed(3)), 'S', s.map(x=>+x.toFixed(3)), 'min', mn.map(x=>+x.toFixed(4)), 'max', mx.map(x=>+x.toFixed(4)), e)
}
