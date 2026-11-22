/** Sonde de réflexion dynamique pour la voiture (alternative bon marché au SSR / ray tracing) : cube-map HDR rendue à la
 *  position de la voiture, UNE face par image (6 images pour un cube complet), ombres non recalculées pendant ce rendu,
 *  puis préfiltrage PMREM par three.js (rugosité). La carrosserie reflète ainsi la piste, les rails et le ciel réels. */
import * as THREE from 'three'
export class ReflectionProbe {
  rt: THREE.WebGLCubeRenderTarget; cam: THREE.CubeCamera
  private face = 0; private every: number; private tick = 0; private pos = new THREE.Vector3()
  constructor(size: number, every = 1) {
    this.rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false })
    this.cam = new THREE.CubeCamera(0.3, 9800, this.rt); this.every = Math.max(1, every)
  }
  /** PMREM fait ici (et non par three.js à la volée) : on peut VÉRIFIER le résultat. Sur WebKit, la conversion
   *  automatique d'une cube-map HalfFloat donnait une carrosserie noire ; si la sortie est noire/NaN → repli ciel. */
  private pm: THREE.PMREMGenerator | null = null; pmrt: THREE.WebGLRenderTarget | null = null
  ok: boolean | null = null; check: unknown = null; onFail: (() => void) | null = null
  get texture() { return this.pmrt ? this.pmrt.texture : this.rt.texture }
  private filter(r: THREE.WebGLRenderer) {
    if (!this.pm) this.pm = new THREE.PMREMGenerator(r)
    const prev = r.getRenderTarget()
    const filtered = this.pm.fromCubemap(this.rt.texture as unknown as THREE.CubeTexture, this.pmrt as never)
    // Certains WebGL/Safari renvoient une cible vide lorsque le PMREM ne peut
    // pas être généré (format flottant ou framebuffer indisponible). Le rendu
    // principal doit continuer avec la cubemap non filtrée, pas planter sur
    // `pmrt.width`.
    if (!filtered) { this.ok = true; this.check = { fallback: true }; return }
    this.pmrt = filtered
    r.setRenderTarget(prev)
    if (this.ok === null) { // vérification une fois : quelques texels de la carte filtrée
      const w = this.pmrt.width, h = this.pmrt.height, a = new Uint16Array(4 * w * h)
      let sum = 0, bad = false
      try { r.readRenderTargetPixels(this.pmrt, 0, 0, w, h, a) } catch { sum = 1 /* lecture impossible → on garde */ }
      for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) { const v = THREE.DataUtils.fromHalfFloat(a[i + k]); if (!isFinite(v)) bad = true; else sum += v }
      this.check = { w, h, sum: +sum.toFixed(2), bad }
      this.ok = !bad && sum > 1e-4
      if (!this.ok) this.onFail?.()
    }
  }
  setEvery(n: number) { this.every = Math.max(1, n | 0) }
  /** à appeler une fois par image, avant le rendu principal. hide : objets à masquer (la voiture elle-même). */
  update(r: THREE.WebGLRenderer, scene: THREE.Scene, at: THREE.Vector3, hide: THREE.Object3D[], force = false) {
    if (!force && ++this.tick % this.every) return
    if (this.face === 0) { this.pos.copy(at); this.pos.y += 0.55; this.cam.position.copy(this.pos); this.cam.updateMatrixWorld(true) }
    if (this.cam.coordinateSystem !== r.coordinateSystem) { this.cam.coordinateSystem = r.coordinateSystem; this.cam.updateCoordinateSystem() }
    const prevRT = r.getRenderTarget(), au = r.shadowMap.autoUpdate, vis = hide.map(o => o.visible)
    // (forcé = 1er rendu : on laisse les ombres se calculer, sinon l'état d'ombre initial reste faux → image blanchie)
    hide.forEach(o => { o.visible = false }); if (!force) r.shadowMap.autoUpdate = false
    const faces = force ? [0, 1, 2, 3, 4, 5] : [this.face]
    for (const f of faces) { r.setRenderTarget(this.rt, f); r.render(scene, this.cam.children[f] as THREE.Camera) }
    r.setRenderTarget(prevRT); r.shadowMap.autoUpdate = au; hide.forEach((o, i) => { o.visible = vis[i] })
    this.face = force ? 0 : (this.face + 1) % 6
    if ((force || this.face === 0)) this.filter(r)
  }
}
