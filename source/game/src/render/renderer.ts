/** Rendu three.js : éclairage hybride (raster temps réel + éclairage précalculé), PAS de ray tracing temps réel.
 *  IBL ciel physique (Sky → PMREM), soleil directionnel à ombres douces qui suivent la voiture (texels stabilisés),
 *  sonde de réflexion cube dynamique pour la voiture (src/render/probe.ts), AO précalculée Cycles sur la piste
 *  (src/render/bakedAO.ts), tone mapping ACES, GTAO (occlusion ambiante écran), bloom léger, niveaux de qualité. */
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { diag, dlog } from '../diag.ts'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { QUALITY, type QualityName, type QualityPreset } from '../quality/quality.ts'
import { CarRig } from './carRig.ts'
import { CameraRig } from './cameras.ts'
import { Effects } from './effects.ts'
import { applyBakedAO, stripBakedAO, BAKED_AO_DEFAULT } from './bakedAO.ts'
import { ReflectionProbe } from './probe.ts'
import type { Game, Pose } from '../core/game.ts'
import type { TrackSurface } from '../track/surface.ts'

export type Progress = (label: string, frac: number) => void
/** Téléchargement avec progression (fetch + flux), puis analyse glTF (meshopt). */
async function loadGLB(url: string, onp: (f: number) => void, ktx: KTX2Loader | null = null): Promise<GLTF> {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' : HTTP ' + r.status)
  const total = Number(r.headers.get('content-length')) || 0
  let buf: ArrayBuffer
  if (r.body && total) {
    const rd = r.body.getReader(), parts: Uint8Array[] = []; let got = 0
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onp(Math.min(1, got / total)) }
    const all = new Uint8Array(got); let o = 0; for (const p of parts) { all.set(p, o); o += p.length }
    buf = all.buffer
  } else { buf = await r.arrayBuffer(); onp(1) }
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); if (ktx) loader.setKTX2Loader(ktx)
  return await new Promise((res, rej) => loader.parse(buf, url.replace(/[^/]*$/, ''), res, rej))
}

/** multiplicateur d'albédo, intensité spéculaire max (valeurs E, calées visuellement sur photos de Spa) */
const ALBEDO_FIX: Record<string, [number, number]> = {
  'road-ext-tile': [0.36, 0.3], 'asph-grv': [0.55, 0.3], 'asph_pitlane_old': [0.6, 0.3], 'asph-pitlane-old': [0.5, 0.3],
  'asph_new': [0.95, 0.3], 'groove1': [0.85, 0.35], 'groove2': [0.85, 0.35], 'groove3': [0.85, 0.35], 'groove_custom': [0.85, 0.35],
  'Parking': [0.8, 0.3], 'sand': [0.7, 0.2], 'misc': [0.8, 0.5], 'walls': [0.85, 0.4], 'new_AO': [0.85, 0.5],
}
const TRACK_DIR = './assets/spa/'
/** tuiles chargées avant le départ : décor global + celles dont la sphère englobante passe à moins de NEAR_M m de la voiture (au moins 3) ; E */
const NEAR_M = 150
export interface TileInfo { id: string; file: string; nodes: number; tris: number; cx: number; cz: number; r: number; geoBytes: number; tex: string[] }
export interface TileManifest { version: number; tiles: TileInfo[]; texSizes: Record<string, number> }
/** matériaux partagés entre tuiles (extras.mid) → chaque texture n'est décodée et envoyée au GPU qu'une fois */
const SHARED_MATS = new Map<number, Promise<THREE.Material>>()
const SHARED_TEX = new Map<string, Promise<THREE.Texture>>()
/** KTX2 UASTC (tools/make_ktx2.py) : transcodé en ASTC (iPhone) / BC7 / ETC2 → ~4× moins de mémoire GPU que le WebP
 *  décodé en RGBA, et pas de copie décodée côté CPU. Repli automatique sur le WebP si le transcodage échoue. */
let KTX: KTX2Loader | null = null, KTX_LIST: Record<string, [number, number]> = {}
const GL_FILTER: Record<number, THREE.TextureFilter> = { 9728: THREE.NearestFilter, 9729: THREE.LinearFilter, 9984: THREE.NearestMipmapNearestFilter, 9985: THREE.LinearMipmapNearestFilter, 9986: THREE.NearestMipmapLinearFilter, 9987: THREE.LinearMipmapLinearFilter }
const GL_WRAP: Record<number, THREE.Wrapping> = { 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping, 10497: THREE.RepeatWrapping }
function texBytes(t: THREE.Texture) {
  const c = t as THREE.CompressedTexture
  if (c.isCompressedTexture) return c.mipmaps.reduce((a, m) => a + ((m as { data: ArrayBufferView }).data?.byteLength ?? 0), 0)
  const im = t.image as { width?: number; height?: number } | undefined
  return im?.width && im.height ? im.width * im.height * 4 * 1.33 : 0
}
async function loadKtx(url: string, sampler: { magFilter?: number; minFilter?: number; wrapS?: number; wrapT?: number }): Promise<THREE.Texture> {
  const t = await KTX!.loadAsync(url)
  t.flipY = false
  t.magFilter = (GL_FILTER[sampler.magFilter ?? 9729] ?? THREE.LinearFilter) as THREE.MagnificationTextureFilter
  t.minFilter = t.mipmaps.length > 1 ? (GL_FILTER[sampler.minFilter ?? 9987] ?? THREE.LinearMipmapLinearFilter) : THREE.LinearFilter
  t.wrapS = GL_WRAP[sampler.wrapS ?? 10497] ?? THREE.RepeatWrapping; t.wrapT = GL_WRAP[sampler.wrapT ?? 10497] ?? THREE.RepeatWrapping
  t.userData.mimeType = 'image/ktx2'
  return t
}
/** démarrage progressif (mobile) : les grosses textures KTX2 ne bloquent pas le départ ; un gris neutre 4×4 les
 *  remplace le temps du téléchargement, puis elles sont échangées dans les matériaux (sans recompilation). */
let LAZY = false
// grosses textures différées : téléchargées une par une APRÈS « Prêt » (ne volent pas la bande passante du démarrage)
let lazyGo: () => void = () => {}
let LAZY_CHAIN: Promise<unknown> = new Promise<void>(r => { lazyGo = r })
const PH_READY = new Map<string, THREE.Texture>(), PH_WAIT = new Set<string>()
let onLazyReady: ((key: string) => void) | null = null
function placeholder(key: string) {
  const t = new THREE.DataTexture(new Uint8Array(64).fill(150), 4, 4); t.flipY = false; t.needsUpdate = true
  t.userData.ph = key; return t
}
function tileLoader(): GLTFLoader {
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder)
  l.register(parser => {
    // textures partagées entre tuiles, clé = fichier + échantillonneur (sinon une copie GPU par tuile)
    const orig = parser.loadTextureImage.bind(parser)
    parser.loadTextureImage = (ti: number, si: number, ld: THREE.Loader) => {
      const sd = parser.json.images[si], td = parser.json.textures[ti]
      if (typeof sd.uri !== 'string') return orig(ti, si, ld)
      const key = sd.uri + '|' + JSON.stringify(parser.json.samplers?.[td.sampler] ?? {})
      let p = SHARED_TEX.get(key)
      if (!p) {
        const m = /tex\/([0-9a-f]+)\.webp$/.exec(sd.uri)
        if (m && KTX && KTX_LIST[m[1]] && LAZY) {
          const url = TRACK_DIR + 'tex/' + m[1] + '.ktx2', smp = parser.json.samplers?.[td.sampler] ?? {}
          PH_WAIT.add(key)
          const job = LAZY_CHAIN.then(() => loadKtx(url, smp)); LAZY_CHAIN = job.catch(() => {})
          void job.catch(e => { dlog('KTX2 → repli WebP ' + m[1] + ' : ' + (e as Error).message); return orig(ti, si, ld) })
            .then(t => { diag.texBytes += texBytes(t); PH_READY.set(key, t); PH_WAIT.delete(key); SHARED_TEX.set(key, Promise.resolve(t)); onLazyReady?.(key) })
            .catch(e => { PH_WAIT.delete(key); dlog('texture ' + m[1] + ' : ' + (e as Error).message) })
          p = Promise.resolve(placeholder(key) as THREE.Texture)
          SHARED_TEX.set(key, p)
          return p
        }
        p = (m && KTX && KTX_LIST[m[1]]) ? loadKtx(TRACK_DIR + 'tex/' + m[1] + '.ktx2', parser.json.samplers?.[td.sampler] ?? {}).catch(e => { dlog('KTX2 → repli WebP ' + m[1] + ' : ' + (e as Error).message); return orig(ti, si, ld) }) : orig(ti, si, ld)
        p = p.then(t => { diag.texBytes += texBytes(t); return t })
        SHARED_TEX.set(key, p)
      }
      return p
    }
    return { name: 'w11_shared_materials', loadMaterial(i: number) {
    const mid = (parser.json.materials?.[i]?.extras as { mid?: number } | undefined)?.mid
    if (mid == null) return null
    let p = SHARED_MATS.get(mid); if (!p) { p = parser.loadMaterial(i); SHARED_MATS.set(mid, p) }
    return p
  } } as never })
  return l
}
export class Renderer {
  canvas: HTMLCanvasElement; r: THREE.WebGLRenderer; scene = new THREE.Scene()
  q: QualityPreset; sun = new THREE.DirectionalLight(0xfff1e0, 3.1); hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4632, 0.25)
  sunDir = new THREE.Vector3()
  composer: EffectComposer | null = null; gtao: GTAOPass | null = null; bloom: UnrealBloomPass | null = null
  car = new THREE.Group(); rig: CarRig | null = null; cams!: CameraRig; fx!: Effects
  track: THREE.Group | null = null
  tiles: { man: TileManifest; loaded: Set<string>; total: number; bytes: number } | null = null
  fxLevel = 0
  tilesAtStart = 0
  private an = 1; private streaming = false
  scale = 1
  mobile = false
  private ctex = new Set<THREE.CompressedTexture>()
  probeSize = 0
  lastTile = '—'
  private parked = new Map<string, THREE.Object3D>()
  probe: ReflectionProbe | null = null
  bakedAO: { meshes: number; materials: number } | null = null
  look: { tm: string; exp: number; sun: number; env: number; hemi: number; sat: number; con: number }
  private pose: Pose = { pos: [0, 0, 0], q: [0, 0, 0, 1] }
  private cgOff = new THREE.Vector3(); private v3 = new THREE.Vector3()
  private drv: THREE.Object3D | null = null
  private wheelsBuf: { c: number; angle: number; steer: number }[] = []
  constructor(canvas: HTMLCanvasElement, quality: QualityName, opt: { safe?: boolean; mobile?: boolean; ktx?: boolean; onLost?: () => void } = {}) {
    this.canvas = canvas
    // mode sans échec : préréglage le plus léger. Mobile : densité de pixels plafonnée à 1,5 (écran 3× → 2,25× moins de pixels)
    this.q = opt.safe ? { ...QUALITY.low, dprMax: 1 } : { ...QUALITY[quality] }
    if (opt.mobile && !opt.safe) this.q.dprMax = Math.min(this.q.dprMax, 2) // DPR natif jusqu'à 2 ; la résolution dynamique baisse si les images chutent
    // MSAA du canevas inutile quand le rendu passe par le composeur (sa cible a son propre MSAA) → mémoire économisée
    const post = this.q.bloom || this.q.gtao
    this.r = new THREE.WebGLRenderer({ canvas, antialias: this.q.msaa && !post, powerPreference: 'high-performance', alpha: false, stencil: false })
    this.mobile = !!opt.mobile
    LAZY = !!opt.mobile
    onLazyReady = () => { if (this.track) this.swapPlaceholders(this.track) }
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); dlog('contexte WebGL perdu'); opt.onLost?.() })
    if (opt.ktx) {
      try { KTX = new KTX2Loader().setTranscoderPath('./basis/').setWorkerLimit(opt.mobile ? 1 : 2); KTX.detectSupport(this.r) } catch (e) { KTX = null; dlog('KTX2 indisponible : ' + (e as Error).message) }
    }
    this.r.outputColorSpace = THREE.SRGBColorSpace
    this.r.info.autoReset = false // compteurs sur l'image complète (toutes les passes), remis à zéro dans frame()
    // réglages d'éclairage surchargeables par l'URL (?tm=aces|agx&exp=&sun=&env=&hemi=) pour les comparaisons
    const P = new URLSearchParams(location.search), num = (k: string, d: number) => P.has(k) ? Number(P.get(k)) : d
    this.look = { tm: P.get('tm') ?? 'aces', exp: num('exp', 0.85), sun: num('sun', 3.3), env: num('env', 0.3), hemi: num('hemi', 0.1), sat: num('sat', 1.0), con: num('con', 1.06) } // E : réglage visuel (comparatifs out/look/cmp_light.png)
    this.r.toneMapping = this.look.tm === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping
    this.r.toneMappingExposure = this.look.exp
    this.sun.intensity = this.look.sun; this.hemi.intensity = this.look.hemi
    this.r.shadowMap.enabled = true
    this.r.shadowMap.type = this.q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    this.scene.add(this.hemi, this.sun, this.sun.target, this.car)
  }
  /** Ciel physique (Preetham) + IBL préfiltrée (PMREM) — soleil réaliste ~38° de haut, après-midi à Spa. */
  buildSky() {
    const sky = new Sky(); sky.scale.setScalar(9000)
    const u = sky.material.uniforms
    u.turbidity.value = 4.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.0035; u.mieDirectionalG.value = 0.8
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(215))
    u.sunPosition.value.copy(this.sunDir)
    const pm = new THREE.PMREMGenerator(this.r)
    const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000)
    Object.assign(sky2.material.uniforms.sunPosition.value, this.sunDir)
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const) sky2.material.uniforms[k].value = u[k].value
    envScene.add(sky2)
    // sol neutre pour l'IBL (sinon l'hémisphère bas est noir → reflets du dessous de caisse irréalistes)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2c2e26 }))
    ground.position.y = -2; envScene.add(ground)
    const env = pm.fromScene(envScene, 0.02).texture
    this.scene.environment = env; this.scene.environmentIntensity = this.look.env * this.q.envIntensity
    this.scene.add(sky); sky.frustumCulled = false
    pm.dispose()
    this.sun.castShadow = true
    const s = this.sun.shadow; s.mapSize.set(this.q.shadowMap, this.q.shadowMap)
    const R = this.q.shadowRange; Object.assign(s.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 400 }); s.camera.updateProjectionMatrix()
    s.bias = -0.00025; s.normalBias = 0.035; s.radius = 3
  }
  async load(game: Game, track: TrackSurface, prog: Progress) {
    this.buildSky()
    const q = this.q
    // piste PLEINE QUALITÉ pour tous les niveaux (source la plus détaillée : 1,18 M triangles, textures natives jusqu'à
    // 8192×1024, AO Cycles cuite) découpée en 13 tuiles (tools/build_track_tiles.mjs) : décor global + tuiles proches
    // chargés avant le départ, le reste en arrière-plan, du plus proche au plus loin. Textures partagées (une seule copie GPU).
    // voiture : version KTX2 (59 textures en ASTC, ~60 Mo GPU au lieu de ~235 Mo de WebP décodé) dès que KTX2 est actif
    const cu = `./assets/w11_lh2020_${q.car}.glb`, cuK = `./assets/w11_lh2020_${q.car}_ktx2.glb`
    const man = await (await fetch(TRACK_DIR + 'tiles.json')).json() as TileManifest
    this.tiles = { man, loaded: new Set(), total: man.tiles.length, bytes: 0 }
    if (KTX) { try { KTX_LIST = await (await fetch(TRACK_DIR + 'tex/ktx2.json')).json(); diag.ktx = true; dlog('KTX2 actif (' + Object.keys(KTX_LIST).length + ' textures)') } catch { KTX = null; dlog('ktx2.json absent → WebP') } }
    const pos = game.pose(this.pose).pos, d = (t: TileInfo) => t.id === 'base' ? -1e9 : Math.hypot(t.cx - pos[0], t.cz - pos[2]) - t.r
    const srt = [...man.tiles].sort((a, b) => d(a) - d(b)), first = srt.filter((t, i) => this.mobile ? i < 2 : (i < 4 || d(t) < NEAR_M)) /* mobile : décor + tuile du départ seulement → démarrage plus rapide, le reste en flux */, w = (t: TileInfo) => t.geoBytes + t.tex.reduce((a, u) => a + (man.texSizes[u] ?? 0), 0)
    const W = first.reduce((a, t) => a + w(t), 0) * 1.15
    let ft = 0, fc = 0
    const upd = () => prog('Chargement de la piste', Math.min(1, ft / W) * 0.88 + fc * 0.12)
    this.track = new THREE.Group(); this.track.name = 'track'
    const an = Math.min(this.r.capabilities.getMaxAnisotropy(), q.anisotropy); this.an = an
    this.memLog('avant chargement')
    const [cg] = await Promise.all([(KTX ? loadGLB(cuK, f => { fc = f; upd() }, KTX).catch(e => { dlog('voiture KTX2 → repli WebP : ' + (e as Error).message); return loadGLB(cu, f => { fc = f; upd() }) }) : loadGLB(cu, f => { fc = f; upd() })),
      ...first.map(t => this.loadTile(t).then(() => { ft += w(t); upd() }))])
    prog('Préparation des matériaux', 1)
    this.memLog('piste + voiture analysées')
    this.tilesAtStart = this.tiles.loaded.size
    this.scene.add(this.track)
    this.rig = new CarRig(cg, an)
    this.car.add(this.rig.root)
    // reflets réels de l'environnement sur la voiture (sonde cube dynamique), sinon IBL du ciel seul
    const P = new URLSearchParams(location.search)
    const ps = P.has('probe') ? Number(P.get('probe')) : q.probe
    this.probeSize = ps
    if (ps > 0 && !this.mobile) {
      this.probe = new ReflectionProbe(ps, q.probeEvery)
      const ei = this.look.env * q.envIntensity
      this.rig.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
        for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) if ('envMap' in mt) { mt.envMap = this.probe!.texture; mt.envMapIntensity = ei; mt.needsUpdate = true } })
    }
    this.cgOff.set(game.car.cg[0], game.car.cg[1], game.car.cg[2])
    const dpr = Math.min(window.devicePixelRatio || 1, q.dprMax)
    this.r.setPixelRatio(dpr)
    this.cams = new CameraRig(innerWidth / innerHeight, q.drawDistance, track)
    this.fx = new Effects(q.particles); this.scene.add(this.fx.group)
    // mobile : démarrage SANS composeur (cibles HalfFloat MSAA), sans sonde cube, ombre 1024 → upgrade() après stabilité
    if (this.mobile) { const s = this.sun.shadow, sm = Math.min(1024, q.shadowMap); s.mapSize.set(sm, sm) } else this.setupPost()
    this.resize()
    // compile tous les shaders avant la première image (évite les saccades au premier virage)
    prog('Compilation des shaders', 1)
    this.syncCar(game, 0)
    this.cams.update(this.car, this.rig.eye, this.rig.tcam, 0, 0.016, 0, 0)
    await this.r.compileAsync(this.scene, this.cams.cam)
    this.probe?.update(this.r, this.scene, this.car.position, [this.car, this.fx.group], true)
    this.memLog('shaders compilés')
  }
  /** mobile : montée en qualité progressive une fois le jeu démarré et stable (composeur → ombre → sonde). */
  upgraded = false
  async upgrade() {
    if (this.upgraded || !this.mobile) return
    this.upgraded = true
    const q = this.q, wait = (ms: number) => new Promise(r => setTimeout(r, ms))
    if (q.bloom || q.gtao) { this.setupPost(); this.resize(); const f = this.fxLevel; this.fxLevel = -1; this.setFx(f); this.memLog('qualité ↑ effets (composeur)'); await wait(4000) }
    const s = this.sun.shadow; if (s.mapSize.x !== q.shadowMap && this.fxLevel < 3) { s.mapSize.set(q.shadowMap, q.shadowMap); s.map?.dispose(); s.map = null; this.memLog('qualité ↑ ombre ' + q.shadowMap); await wait(4000) }
    if (this.probeSize > 0 && this.rig && !this.probe) {
      this.probe = new ReflectionProbe(this.probeSize, q.probeEvery)
      const ei = this.look.env * q.envIntensity
      this.rig.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
        for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) if ('envMap' in mt) { mt.envMap = this.probe!.texture; mt.envMapIntensity = ei; mt.needsUpdate = true } })
      this.memLog('qualité ↑ reflets sonde ' + this.probeSize)
    }
  }
  /** estimation mémoire GPU des objets dans la scène (textures uniques par source, géométries, cibles, ombre). */
  gpuEstimate() {
    const src = new Set<unknown>(), geos = new Set<THREE.BufferGeometry>(); let tex = 0, geo = 0
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      if (!geos.has(m.geometry)) { geos.add(m.geometry); for (const a of Object.values(m.geometry.attributes)) geo += (a as THREE.BufferAttribute).array?.byteLength ?? 0; geo += m.geometry.index?.array.byteLength ?? 0 }
      for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as unknown as Record<string, unknown>[]) for (const v of Object.values(mt)) {
        const t = v as THREE.Texture; if (!t || !(t as THREE.Texture).isTexture || src.has(t.source)) continue; src.add(t.source); tex += texBytes(t) } })
    const c = this.canvas, px = c.width * c.height
    const rt = px * 8 + (this.composer ? px * (8 * (this.q.msaa ? 5 : 1) + 4) + (this.q.gtao ? px * 12 : 0) : 0)
    const sh = this.sun.shadow.mapSize.x ** 2 * 4, probe = this.probe ? this.probeSize ** 2 * 6 * 8 * 1.33 : 0
    return { tex, geo, rt, sh: sh + probe, total: tex + geo + rt + sh + probe }
  }
  memLog(lbl: string) {
    const m = this.r.info.memory, e = this.gpuEstimate(), M = (b: number) => (b / 1048576).toFixed(0)
    dlog(`${lbl} · GPU ≈ ${M(e.total)} Mo (tex ${M(e.tex)}, géo ${M(e.geo)}, cibles ${M(e.rt)}, ombre ${M(e.sh)}) · info.memory géo ${m.geometries} tex ${m.textures} · tuile ${this.lastTile}`)
    diag.gpu = e
  }
  /** charge une tuile, applique corrections d'albédo, AO cuite et ombres, précompile ses shaders puis l'ajoute. */
  async loadTile(t: TileInfo, lod = false) {
    const g = await tileLoader().loadAsync(TRACK_DIR + (lod ? t.file.replace('.gltf', '_lod.gltf') : t.file))
    const root = g.scene, q = this.q, an = this.an
    root.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.receiveShadow = !lod; m.castShadow = !lod && q.name === 'ultra'
      m.matrixAutoUpdate = false; m.updateMatrix()
      for (const mt of (Array.isArray(m.material) ? m.material : [m.material])) {
        const s = mt as THREE.MeshPhysicalMaterial; for (const k of ['map', 'normalMap', 'roughnessMap'] as const) if (s[k]) s[k]!.anisotropy = an
        for (const k of ['map', 'specularIntensityMap', 'specularColorMap', 'emissiveMap'] as const) { const t = s[k] as THREE.CompressedTexture | null; if (t?.isCompressedTexture) this.ctex.add(t) }
        // correction d'albédo PBR : textures d'asphalte trop claires (moy. sRGB 180 ≈ 0,46 linéaire ; asphalte réel ≈ 0,08–0,15)
        const fix = ALBEDO_FIX[s.name.replace(/\.\d+$/, '')]
        if (fix && !s.userData.fixed) { s.userData.fixed = true; s.color.multiplyScalar(fix[0]); if ('specularIntensity' in s) s.specularIntensity = Math.min(s.specularIntensity ?? 1, fix[1]) }
      }
    })
    // AO précalculée Cycles (COLOR_0) → éclairage indirect ; ?bao=0 pour comparer sans
    const P = new URLSearchParams(location.search), n = (k: string, d: number) => P.has(k) ? Number(P.get(k)) : d
    if (P.get('bao') !== '0') {
      const r = applyBakedAO(root, { strength: n('aok', BAKED_AO_DEFAULT.strength), ground: n('aog', BAKED_AO_DEFAULT.ground), direct: n('aod', BAKED_AO_DEFAULT.direct), floor: n('aof', BAKED_AO_DEFAULT.floor) })
      this.bakedAO = { meshes: (this.bakedAO?.meshes ?? 0) + r.meshes, materials: (this.bakedAO?.materials ?? 0) + r.materials }
    } else stripBakedAO(root)
    root.name = 'tile_' + t.id + (lod ? '_lod' : '')
    root.updateMatrixWorld(true)
    if (this.cams) { // streaming en jeu : shaders compilés et textures envoyées au GPU avant l'ajout (pas de saccade visible)
      await this.r.compileAsync(root, this.cams.cam, this.scene)
      root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
        for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'] as const) if (mt[k]) this.r.initTexture(mt[k]!) })
    }
    this.swapPlaceholders(root)
    this.track!.add(root)
    if (lod) this.lodIn.set(t.id, root); else { this.tiles!.loaded.add(t.id); this.tiles!.bytes += t.geoBytes }
    this.lastTile = t.id + (lod ? ' (LOD)' : '')
    if (this.cams) this.memLog('tuile ' + this.lastTile + ' ajoutée')
  }
  lodIn = new Map<string, THREE.Object3D>()
  /** remplace les textures provisoires dont la vraie version est arrivée (y compris les clones « texture transform ») */
  swapPlaceholders(root: THREE.Object3D) {
    const SLOTS = ['map', 'specularIntensityMap', 'specularColorMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'] as const
    root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshPhysicalMaterial[]) for (const k of SLOTS) {
        const ph = mt[k] as THREE.Texture | null | undefined, key = ph?.userData?.ph as string | undefined
        if (!key) continue
        const real = PH_READY.get(key); if (!real) continue
        let t = real
        if (real.userData.used) { t = real.clone(); t.userData = { ...real.userData } } // autre réglage (UV, transformée) → clone partageant la même source GPU
        real.userData.used = true
        t.colorSpace = ph!.colorSpace; t.channel = ph!.channel
        t.offset.copy(ph!.offset); t.repeat.copy(ph!.repeat); t.rotation = ph!.rotation; t.center.copy(ph!.center)
        if (k === 'map' || k === 'normalMap' || k === 'roughnessMap') t.anisotropy = this.an
        ;(mt as unknown as Record<string, THREE.Texture>)[k] = t
        if ((t as THREE.CompressedTexture).isCompressedTexture) this.ctex.add(t as THREE.CompressedTexture)
        ph!.dispose()
      } })
  }
  get texturesPending() { return PH_WAIT.size }
  /** tuiles restantes en arrière-plan, la plus proche de la voiture d'abord (recalculé à chaque tuile). */
  async streamTiles(game: Game) {
    if (this.streaming || !this.tiles) return
    this.streaming = true
    lazyGo()
    const T = this.tiles
    if (this.mobile) return this.streamNear(game)
    for (;;) {
      const left = T.man.tiles.filter(t => !T.loaded.has(t.id)); if (!left.length) break
      const p = game.pose(this.pose).pos
      left.sort((a, b) => (Math.hypot(a.cx - p[0], a.cz - p[2]) - a.r) - (Math.hypot(b.cx - p[0], b.cz - p[2]) - b.r))
      try { await this.loadTile(left[0]) } catch (e) { console.warn('tuile', left[0].id, e); await new Promise(r => setTimeout(r, 3000)) }
    }
    this.streaming = false
    while (PH_WAIT.size) await new Promise(r => setTimeout(r, 1000)) // textures provisoires encore en route
    if (this.track) this.swapPlaceholders(this.track)
    // toute la piste est chargée : envoi au GPU des textures compressées puis libération de leur copie CPU
    // (aucune nouvelle tuile ne les clonera plus ; elles ne sont jamais ré-envoyées)
    let freed = 0
    for (const t of this.ctex) { try { this.r.initTexture(t); freed += texBytes(t); t.mipmaps = [] } catch (e) { dlog('libération texture : ' + (e as Error).message) } }
    this.ctex.clear(); dlog('piste complète · ' + (freed / 1048576).toFixed(0) + ' Mo de copies CPU libérées')
  }
  /** mobile : seules les tuiles à moins de NEAR_MOB m de la voiture sont dans la scène (au GPU) ; au-delà de FAR_MOB elles
   *  sont retirées et leurs tampons GPU libérés (géométrie gardée en mémoire JS → ré-ajout sans nouveau téléchargement).
   *  Une seule opération par pas (≥ 250 ms) → envois au GPU étalés sur plusieurs images. Le décor « base » reste. */
  private async streamNear(game: Game) {
    // pleine qualité < FULL m ; LOD (géométrie simplifiée, mêmes textures) jusqu'à AHEAD m devant / BEHIND m derrière ; au-delà retirée
    const T = this.tiles!, FULL = 600, AHEAD = 1500, BEHIND = 800, HYST = 200, wait = (ms: number) => new Promise(r => setTimeout(r, ms))
    let prev: number[] | null = null, fx = 0, fz = 1
    const drop = (root: THREE.Object3D) => { this.track!.remove(root); root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose() }) }
    for (;;) {
      await wait(250)
      if (!this.track) continue
      const p = game.pose(this.pose).pos
      if (prev) { const dx = p[0] - prev[0], dz = p[2] - prev[2], l = Math.hypot(dx, dz); if (l > 2) { fx = dx / l; fz = dz / l; prev = [p[0], p[1], p[2]] } } else prev = [p[0], p[1], p[2]]
      const d = (t: TileInfo) => Math.max(0, Math.hypot(t.cx - p[0], t.cz - p[2]) - t.r)
      const lim = (t: TileInfo) => ((t.cx - p[0]) * fx + (t.cz - p[2]) * fz >= 0 ? AHEAD : BEHIND)
      const tl = T.man.tiles.filter(t => t.id !== 'base'), full = (t: TileInfo) => T.loaded.has(t.id) && !this.parked.has(t.id)
      // 1) retirer ce qui sort de la fenêtre
      const out = tl.find(t => (full(t) || this.lodIn.has(t.id)) && d(t) > lim(t) + HYST)
      if (out) { if (full(out)) { const r = this.track.getObjectByName('tile_' + out.id); if (r) { drop(r); this.parked.set(out.id, r) } }
        const l = this.lodIn.get(out.id); if (l) { drop(l); this.lodIn.delete(out.id) }
        this.memLog('tuile ' + out.id + ' retirée (loin)'); continue }
      // 2) pleine qualité pour la plus proche qui en manque (puis on retire son LOD)
      const near = tl.filter(t => !full(t) && d(t) < FULL).sort((a, b) => d(a) - d(b))[0]
      if (near) {
        const pk = this.parked.get(near.id)
        if (pk) { this.parked.delete(near.id); this.swapPlaceholders(pk); this.track.add(pk); this.lastTile = near.id; this.memLog('tuile ' + near.id + ' remise') }
        else try { await this.loadTile(near) } catch (e) { dlog('tuile ' + near.id + ' : ' + (e as Error).message); await wait(3000); continue }
        const l = this.lodIn.get(near.id); if (l) { drop(l); this.lodIn.delete(near.id) }
        continue
      }
      // 3) LOD pour les tuiles lointaines visibles qui n'ont rien
      const lodT = tl.filter(t => !full(t) && !this.lodIn.has(t.id) && d(t) < lim(t)).sort((a, b) => d(a) - d(b))[0]
      if (lodT) { try { await this.loadTile(lodT, true) } catch (e) { dlog('LOD ' + lodT.id + ' : ' + (e as Error).message); await wait(3000) } continue }
      // 4) pleine qualité → LOD quand la tuile s'éloigne
      const dn = tl.find(t => full(t) && d(t) > FULL + HYST && d(t) < lim(t))
      if (dn) { if (!this.lodIn.has(dn.id)) try { await this.loadTile(dn, true) } catch (e) { dlog('LOD ' + dn.id + ' : ' + (e as Error).message) }
        const r = this.track.getObjectByName('tile_' + dn.id); if (r) { drop(r); this.parked.set(dn.id, r) } this.memLog('tuile ' + dn.id + ' → LOD'); continue }
      await wait(750)
    }
  }
  get tilesInScene() { return this.track ? this.track.children.length : 0 }
  /** effets adaptatifs (jamais la géométrie ni les textures de la piste) : 0 = tout ; 1 = sans GTAO ; 2 = + sans bloom ;
   *  3 = + carte d'ombre ÷ 2 et sonde de réflexion 2× moins souvent. */
  setFx(level: number) {
    level = Math.max(0, Math.min(3, level | 0)); if (level === this.fxLevel) return
    this.fxLevel = level
    if (this.gtao) this.gtao.enabled = level < 1
    if (this.bloom) this.bloom.enabled = level < 2
    let sm = level >= 3 ? this.q.shadowMap / 2 : this.q.shadowMap; const s = this.sun.shadow
    if (this.mobile && !this.upgraded) sm = Math.min(1024, sm) // iPhone : ombre ≤ 1024 tant que la montée en qualité n'est pas faite
    if (s.mapSize.x !== sm) { s.mapSize.set(sm, sm); s.map?.dispose(); s.map = null }
    this.probe?.setEvery(level >= 3 ? this.q.probeEvery * 2 : this.q.probeEvery)
  }
  setupPost() {
    const q = this.q
    if (!q.bloom && !q.gtao) { this.composer = null; return }
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa ? 4 : 0 })
    this.composer = new EffectComposer(this.r, rt)
    this.composer.addPass(new RenderPass(this.scene, this.cams.cam))
    if (q.gtao) {
      this.gtao = new GTAOPass(this.scene, this.cams.cam, 1, 1)
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: q.name === 'ultra' ? 16 : 8 })
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 })
      this.gtao.blendIntensity = 0.85
      this.composer.addPass(this.gtao)
    }
    // garde-fou HDR : NaN/Inf (spéculaires extrêmes, soleil) → sinon le flou du bloom contamine tout l'écran
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null }, sat: { value: this.look.sat }, con: { value: this.look.con } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
// + étalonnage léger en linéaire HDR, avant ACES (même passe → coût nul) : saturation et contraste autour d'un gris moyen
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float sat, con; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); bvec3 bad = isnan(c.rgb); if (bad.x || bad.y || bad.z || any(isinf(c.rgb))) c.rgb = vec3(0.0); c.rgb = clamp(c.rgb, 0.0, 48.0); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = max(mix(vec3(l), c.rgb, sat), 0.0); c.rgb = 0.22 * pow(c.rgb / 0.22, vec3(con)); gl_FragColor = vec4(min(c.rgb, 48.0), 1.0); }',
    }))
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.12, 0.3, 24.0); this.composer.addPass(this.bloom) }
    this.composer.addPass(new OutputPass())
  }
  resize() {
    const w = innerWidth, h = innerHeight
    this.r.setSize(w, h, false)
    const pr = Math.min(window.devicePixelRatio || 1, this.q.dprMax) * this.scale
    this.r.setPixelRatio(pr)
    if (this.cams) { this.cams.cam.aspect = w / h; this.cams.cam.updateProjectionMatrix() }
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h) }
    if (this.gtao) this.gtao.setSize(Math.round(w * pr * this.q.gtaoScale), Math.round(h * pr * this.q.gtaoScale))
    if (this.fx) this.fx.setScale(h * pr)
  }
  setScale(s: number) { this.scale = s; this.resize() }
  /** Pose interpolée : physique (CG) → origine du modèle (sol, milieu d'empattement). */
  syncCar(game: Game, _dt: number) {
    const p = game.pose(this.pose)
    this.car.quaternion.set(p.q[0], p.q[1], p.q[2], p.q[3])
    this.v3.copy(this.cgOff).applyQuaternion(this.car.quaternion)
    this.car.position.set(p.pos[0] - this.v3.x, p.pos[1] - this.v3.y, p.pos[2] - this.v3.z)
    this.car.updateMatrixWorld(true)
  }
  frame(game: Game, dt: number, shake: number) {
    if (!this.rig) return
    this.r.info.reset()
    this.syncCar(game, dt)
    const a = game.alpha, c = game.car
    const wheels = this.wheelsBuf // pas d'allocation par image
    for (let i = 0; i < c.wheels.length; i++) { const w = c.wheels[i], p = game.prevWheels[i] ?? w, o = wheels[i] ?? (wheels[i] = { c: 0, angle: 0, steer: 0 })
      o.c = p.c + (w.c - p.c) * a; o.angle = p.angle + (w.angle - p.angle) * a; o.steer = p.steer + (w.steer - p.steer) * a }
    this.rig.update(c, wheels, dt)
    // particules : plancher qui frotte → étincelles ; blocage / patinage → fumée
    if (game.maxScrape > 0.05) this.fx.spark(c.scrapePos, c.vel, game.maxScrape)
    if (game.maxImpact > 0.5) this.fx.spark(c.impactPos, c.vel, 2)
    for (const w of c.wheels) {
      if (!w.contact) continue
      const sl = Math.abs(w.slipVel ?? 0)
      if (sl > 6 && w.type < 4) this.fx.puff(w.px, w.py, w.pz, c.vel, Math.min(1, (sl - 6) / 14))
      else if (w.type >= 4 && w.type <= 5 && c.speed > 8) this.fx.puff(w.px, w.py, w.pz, c.vel, 0.25)
    }
    this.fx.update(dt)
    this.cams.shake = shake
    this.cams.update(this.car, this.rig.eye, this.rig.tcam, c.speed, dt, c.gLat, c.gLong)
    // pilote masqué en cockpit (la caméra est dans sa tête)
    const drv = this.drv ?? (this.drv = this.rig.root.getObjectByName('DRV_rig') ?? null); if (drv) drv.visible = this.cams.mode !== 'cockpit'
    // ombres : la caméra d'ombre suit la voiture, recalée sur la grille de texels (pas de scintillement)
    const R = this.q.shadowRange, tex = (2 * R) / this.sun.shadow.mapSize.x
    const cx = this.car.position.x, cz = this.car.position.z
    const lx = Math.round(cx / tex) * tex, lz = Math.round(cz / tex) * tex
    this.sun.target.position.set(lx, this.car.position.y, lz)
    this.sun.position.set(lx + this.sunDir.x * 150, this.car.position.y + this.sunDir.y * 150, lz + this.sunDir.z * 150)
    this.sun.target.updateMatrixWorld()
    this.probe?.update(this.r, this.scene, this.car.position, [this.car, this.fx.group])
    if (this.composer) this.composer.render(dt)
    else this.r.render(this.scene, this.cams.cam)
  }
}
