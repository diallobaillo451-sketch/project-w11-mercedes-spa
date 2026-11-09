import { chromium } from '@playwright/test'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage()
await p.goto('http://127.0.0.1:4199/?q=low'); await p.waitForFunction(() => window.__w11, null, { timeout: 240000 })
console.log(await p.evaluate(() => { const w = window.__w11, r = w.ren, root = r.rig.root, THREE = null
  const inv = r.car.matrixWorld.clone().invert(); const out = {}
  const B = r.rig.eye.constructor // Vector3
  for (const n of ['DRIVER:GEO_Driver_Eyes_Head_Eyes_0', 'Helmet_Visor_Helmet_Visor_0', 'STEERING_WHEEL', 'hand.L', 'hand.R', 'head', 'DRIVER:GEO_Driver_FACE_Head_0', 'Helmet_Visor_Decal_Visor_Decal_0', 'Helmet_Base_Helmet_Base_0']) {
    const o = root.getObjectByName(n); if (!o) continue
    const v = new B(); o.getWorldPosition(v); v.applyMatrix4(inv); out[n] = [v.x, v.y, v.z].map(x => +x.toFixed(3))
    if (o.isMesh) { o.updateWorldMatrix(true,false); const g=o.geometry; g.computeBoundingBox(); const bb0=g.boundingBox.clone().applyMatrix4(o.matrixWorld).applyMatrix4(inv); out[n+" wb"]=[bb0.min.toArray().map(x=>+x.toFixed(3)), bb0.max.toArray().map(x=>+x.toFixed(3))];  o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone(); out[n + ' bbox'] = bb ? [bb.min.toArray().map(x=>+x.toFixed(3)), bb.max.toArray().map(x=>+x.toFixed(3))] : null; out[n+' skinned'] = !!o.isSkinnedMesh }
  }
  out.eye = r.rig.eye.toArray(); out.tcam = r.rig.tcam.toArray(); return JSON.stringify(out, null, 0) }))
await b.close()
