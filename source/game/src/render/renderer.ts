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
import { Showroom } from './showroom.ts'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CameraRig } from './cameras.ts'
import { Effects } from './effects.ts'
import { Grass } from './grass.ts'
import { Crowd } from './crowd.ts'
import { applyWeathering } from './weathering.ts'
import { SkyDome, loadSky } from './skydome.ts'
import { NightLamps, loadLamps } from './night.ts'
import { loadDetail, applyDetail, type DetailSet } from './detail.ts'
import { applyBakedAO, stripBakedAO, BAKED_AO_DEFAULT } from './bakedAO.ts'
import { ReflectionProbe } from './probe.ts'
import { TREE_RE, prepTreeGeometry, prepTreeMaterial, treeUniforms } from './trees.ts'
import { applyWet, wetU, SkidMarks, RainStreaks, LensDrops, DebrisView } from './weatherfx.ts'
import { W11 } from '../physics/params.ts'
import type { Game, Pose } from '../core/game.ts'
import type { TrackSurface } from '../track/surface.ts'
import { CIRCUIT } from '../core/circuit.ts'

export type Progress = (label: string, frac: number) => void
/** Téléchargement avec progression (fetch + flux), puis analyse glTF (meshopt). */
/** libère géométries, matériaux et textures d'un sous-arbre (hors pilote W11 déplacé avant l'appel) */
export function disposeTree(root: THREE.Object3D) {
  const tx = new Set<THREE.Texture>()
  root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry.dispose()
    for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as unknown as Record<string, unknown>[]) { for (const v of Object.values(mt)) if ((v as THREE.Texture)?.isTexture) tx.add(v as THREE.Texture); (mt as unknown as THREE.Material).dispose() } })
  for (const t of tx) t.dispose()
}
export async function loadGLB(url: string, onp: (f: number) => void, ktx: KTX2Loader | null = null): Promise<GLTF> {
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
const TRACK_DIR = CIRCUIT.sceneDir
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
  },
  // alias d'exécution : le fichier garde ses noms de matériaux d'origine (la physique en dépend, on ne les renomme jamais) ;
  // extras.w11_alias demande au jeu de traiter le matériau comme un autre (herbe / gravier de Sepang → GRASS / sand_new de Monza : mêmes détails de proche)
  afterRoot(g: { scene: THREE.Object3D }) {
    g.scene.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      for (const mt of Array.isArray(m) ? m : m ? [m] : []) { const a = (mt.userData as { w11_alias?: string } | undefined)?.w11_alias; if (a) mt.name = a }
    })
  } } as never })
  return l
}
// Garde-fous NaN dans les shaders (WebKit : points noirs sur la carrosserie) : normale nulle/dégénérée → normalize(0) = NaN
// sur les GPU qui suivent strictement la norme (Metal sur iPhone aussi). On remplace par une normale valide.
{ const C = THREE.ShaderChunk as unknown as Record<string, string>
  if (!C.normal_fragment_begin.includes('w11nan')) {
    // matériaux double face : gl_FrontFacing peut être faux sur certains fragments (pilotes WebKit/ANGLE) → normale inversée → point noir.
    // On le recoupe avec la normale de sommet interpolée quand celle-ci est franche (|n·v| > 0,2).
    C.normal_fragment_begin = C.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;\n#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )\n{ float w11fd = dot( normalize( vNormal ), normalize( vViewPosition ) ); if ( abs( w11fd ) > 0.2 ) faceDirection = sign( w11fd ); }\n#endif')
    C.normal_fragment_begin = C.normal_fragment_begin.replace('vec3 nonPerturbedNormal = normal;', '/*w11nan*/ if (any(isnan(normal)) || dot(normal, normal) < 1e-8) normal = vec3(0.0, 0.0, 1.0);\nvec3 nonPerturbedNormal = normal;')
    C.normal_fragment_maps += '\nif (any(isnan(normal)) || dot(normal, normal) < 1e-8 || dot(normal, nonPerturbedNormal) < 0.35) normal = nonPerturbedNormal;'
    // termes d'éclairage : un terme NaN (spéculaire GGX dégénéré, IBL) est mis à zéro au lieu de noircir le pixel ; sortie finale protégée
    C.lights_fragment_end += '\nif (any(isnan(reflectedLight.directSpecular)) || any(isinf(reflectedLight.directSpecular))) reflectedLight.directSpecular = vec3(0.0);\nif (any(isnan(reflectedLight.indirectSpecular)) || any(isinf(reflectedLight.indirectSpecular))) reflectedLight.indirectSpecular = vec3(0.0);\nif (any(isnan(reflectedLight.directDiffuse))) reflectedLight.directDiffuse = vec3(0.0);\nif (any(isnan(reflectedLight.indirectDiffuse))) reflectedLight.indirectDiffuse = diffuseColor.rgb * 0.05;'
    C.opaque_fragment = C.opaque_fragment.replace('gl_FragColor', 'if (any(isnan(outgoingLight)) || any(isinf(outgoingLight))) outgoingLight = diffuseColor.rgb * 0.3;\ngl_FragColor')
    C.clearcoat_normal_fragment_maps += '\n#ifdef USE_CLEARCOAT\nif (any(isnan(clearcoatNormal)) || dot(clearcoatNormal, clearcoatNormal) < 1e-8) clearcoatNormal = nonPerturbedNormal;\n#endif'
  } }
/** netteté adaptative AMD CAS (0 = aucune, 0,125…0,2 = douce) ; ?cas=0 pour comparer */
const CAS = (() => { const v = new URLSearchParams(location.search).get('cas'); return v !== null ? Number(v) : 0.16 })()
const DBG_OVR = new URLSearchParams(location.search).get('ovr')
const P0trees = () => new URLSearchParams(location.search).get('trees') !== '0'
export class Renderer {
  canvas: HTMLCanvasElement; r: THREE.WebGLRenderer; scene = new THREE.Scene()
  q: QualityPreset; sun = new THREE.DirectionalLight(0xfff1e0, 3.1); hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4632, 0.25)
  sunDir = new THREE.Vector3()
  composer: EffectComposer | null = null; gtao: GTAOPass | null = null; bloom: UnrealBloomPass | null = null
  car = new THREE.Group(); rig: CarRig | null = null; cams!: CameraRig; fx!: Effects
  track: THREE.Group | null = null
  /** tuile ajoutée : le jeu y cherche les ancres de la voie des stands */
  onTile: ((root: THREE.Object3D) => void) | null = null
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
  camFollow: THREE.Object3D | null = null
  private pose: Pose = { pos: [0, 0, 0], q: [0, 0, 0, 1] }
  private cgOff = new THREE.Vector3(); private v3 = new THREE.Vector3()
  private ckPrev = false
  private wheelsBuf: { c: number; angle: number; steer: number }[] = []
  constructor(canvas: HTMLCanvasElement, quality: QualityName, opt: { safe?: boolean; mobile?: boolean; ktx?: boolean; onLost?: () => void } = {}) {
    this.canvas = canvas
    // mode sans échec : préréglage le plus léger. Mobile : densité de pixels plafonnée à 1,5 (écran 3× → 2,25× moins de pixels)
    this.q = opt.safe ? { ...QUALITY.low, dprMax: 1 } : { ...QUALITY[quality] }
    // mobile : le GTAO écran (coûteux en pixels) n'est gardé qu'en 2K/30 i/s ; l'AO Cycles précalculée reste partout
    if (opt.mobile && !opt.safe && this.q.name !== 'ultra') this.q.gtao = false
    // MSAA du canevas inutile quand le rendu passe par le composeur (sa cible a son propre MSAA) → mémoire économisée
    const post = this.q.bloom || this.q.gtao
    this.r = new THREE.WebGLRenderer({ canvas, antialias: this.q.msaa && !post, depth: !post, powerPreference: 'high-performance', alpha: false, stencil: false })
    this.mobile = !!opt.mobile
    LAZY = false // plus de textures grises provisoires : une tuile n'entre dans la scène qu'avec ses vraies textures
    onLazyReady = () => { if (this.track) this.swapPlaceholders(this.track) }
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); dlog('contexte WebGL perdu'); opt.onLost?.() })
    if (opt.ktx) {
      try { KTX = new KTX2Loader().setTranscoderPath('./basis/').setWorkerLimit(opt.mobile ? 3 : 4); KTX.detectSupport(this.r) } catch (e) { KTX = null; dlog('KTX2 indisponible : ' + (e as Error).message) }
    }
    this.r.outputColorSpace = THREE.SRGBColorSpace
    this.r.info.autoReset = false // compteurs sur l'image complète (toutes les passes), remis à zéro dans frame()
    // réglages d'éclairage surchargeables par l'URL (?tm=aces|agx&exp=&sun=&env=&hemi=) pour les comparaisons
    const P = new URLSearchParams(location.search), num = (k: string, d: number) => P.has(k) ? Number(P.get(k)) : d
    const NT = CIRCUIT.night // nuit (Marina Bay) : lune, exposition et hémisphère de nuit par défaut (toujours surchargeables par l'URL)
    this.look = { tm: P.get('tm') ?? 'aces', exp: num('exp', NT?.exp ?? 0.85), sun: num('sun', NT?.moon ?? 3.3), env: num('env', 0.3), hemi: num('hemi', NT?.hemi ?? 0.1), sat: num('sat', 1.0), con: num('con', 1.06) } // E : réglage visuel (comparatifs out/look/cmp_light.png)
    this.r.toneMapping = this.look.tm === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping
    this.r.toneMappingExposure = this.look.exp
    // rendu direct (iPhone : sans composeur) → même étalonnage que la passe HDR (saturation, contraste) dans le shader, avant ACES
    { const C = THREE.ShaderChunk as unknown as Record<string, string>, f = (v: number) => v.toFixed(4)
      if (!C.tonemapping_fragment.includes('w11grade')) C.tonemapping_fragment = C.tonemapping_fragment.replace('gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );',
        `/*w11grade*/ { vec3 gc = max(gl_FragColor.rgb, 0.0); float gl = dot(gc, vec3(0.2126, 0.7152, 0.0722)); gc = max(mix(vec3(gl), gc, ${f(this.look.sat)}), 0.0); gl_FragColor.rgb = 0.22 * pow(gc / 0.22, vec3(${f(this.look.con)})); }\n\tgl_FragColor.rgb = toneMapping( gl_FragColor.rgb );`) }
    this.sun.intensity = this.look.sun; this.hemi.intensity = this.look.hemi
    if (NT) this.sun.color.setHex(NT.moonColor) // lumière de lune bleutée
    this.r.shadowMap.enabled = true
    this.r.shadowMap.type = THREE.PCFShadowMap // r18x : PCF filtré (radius) ; PCFSoft n'existe plus
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
    this.setupSun()
  }
  dome: SkyDome | null = null
  /** nuit : halos et lumières des lampadaires (circuits de nuit seulement) */
  night: NightLamps | null = null
  setupSun() {
    this.sun.castShadow = true
    const s = this.sun.shadow; s.mapSize.set(this.q.shadowMap, this.q.shadowMap)
    const R = this.q.shadowRange; Object.assign(s.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 400 }); s.camera.updateProjectionMatrix()
    { const P = new URLSearchParams(location.search); s.bias = P.has('sb') ? Number(P.get('sb')) : -0.00025; s.normalBias = P.has('snb') ? Number(P.get('snb')) : 0.035; s.radius = 3; if (P.get('sh') === '0') this.sun.castShadow = false }
  }
  async load(game: Game, track: TrackSurface, prog: Progress) {
    // ciel photographique HDRI (CC0) ; repli : ciel physique Preetham (?sky=0 pour comparer)
    const P0 = new URLSearchParams(location.search), n0 = (k: string, d: number) => P0.has(k) ? Number(P0.get(k)) : d
    let skyOk = false
    if (P0.get('sky') !== '0') {
      try {
        const { tex, meta } = await loadSky(CIRCUIT.skyDir ?? './assets/sky/', false, Math.min(this.r.capabilities.getMaxAnisotropy(), 4), CIRCUIT.skyDir ? null : KTX /* ciel dédié (nuit) : WebP seulement, pas de .ktx2 à essayer */)
        const NT = CIRCUIT.night
        this.dome = new SkyDome(tex, meta, 215, n0('skyI', NT?.skyI ?? 3.2))
        if (NT) this.dome.mat.uniforms.uSunI.value = n0('moonDisk', NT.moonDisk) // disque lunaire (même direction que la lumière directionnelle)
        this.sunDir.copy(this.dome.sunDir)
        this.scene.add(this.dome.mesh)
        this.scene.environment = this.dome.envMap(this.r, 0x2c2e26); this.scene.environmentIntensity = n0('envH', NT?.env ?? 0.65) * this.q.envIntensity
        this.scene.fog = new THREE.FogExp2(this.dome.fogColor(), n0('fog', NT?.fog ?? 0.00032))
        this.setupSun(); skyOk = true; dlog('ciel HDRI actif (soleil ' + meta.sun.elev.toFixed(1) + '°)')
      } catch (e) { dlog('ciel HDRI indisponible : ' + (e as Error).message) }
    }
    if (!skyOk) this.buildSky()
    const q = this.q
    // piste PLEINE QUALITÉ pour tous les niveaux (source la plus détaillée : 1,18 M triangles, textures natives jusqu'à
    // 8192×1024, AO Cycles cuite) découpée en 13 tuiles (tools/build_track_tiles.mjs) : décor global + tuiles proches
    // chargés avant le départ, le reste en arrière-plan, du plus proche au plus loin. Textures partagées (une seule copie GPU).
    // voiture : version KTX2 (59 textures en ASTC, ~60 Mo GPU au lieu de ~235 Mo de WebP décodé) dès que KTX2 est actif
    const cu = `./assets/w11_lh2020_${q.car}.glb`, cuK = `./assets/w11_lh2020_${q.car}_ktx2.glb`
    const man = await (await fetch(TRACK_DIR + 'tiles.json')).json() as TileManifest
    this.tiles = { man, loaded: new Set(), total: man.tiles.length, bytes: 0 }
    if (KTX) {
      try {
        KTX_LIST = await (await fetch(TRACK_DIR + 'tex/ktx2.json')).json()
        diag.ktx = true; dlog('KTX2 actif (' + Object.keys(KTX_LIST).length + ' textures)')
      } catch {
        // Manifeste absent = textures de piste en WebP, pas absence de support KTX2.
        // Garder KTX pour la W11 et les textures communes évite un pic mémoire sur mobile.
        KTX_LIST = {}; diag.ktx = true
        dlog('ktx2.json absent → piste WebP; KTX2 voiture conservée')
      }
    }
    const pos = game.pose(this.pose).pos, d = (t: TileInfo) => t.id === 'base' ? -1e9 : Math.hypot(t.cx - pos[0], t.cz - pos[2]) - t.r
    const srt = [...man.tiles].sort((a, b) => d(a) - d(b)), first = srt.filter((t, i) => this.mobile ? i < 3 : (i < 4 || d(t) < NEAR_M)) /* mobile : décor + tuile du départ seulement → démarrage plus rapide, le reste en flux */, w = (t: TileInfo) => t.geoBytes + t.tex.reduce((a, u) => a + (man.texSizes[u] ?? 0), 0)
    const W = first.reduce((a, t) => a + w(t), 0) * 1.15
    let ft = 0, fc = 0
    const upd = () => prog('Chargement de la piste', Math.min(1, ft / W) * 0.88 + fc * 0.12)
    this.track = new THREE.Group(); this.track.name = 'track'
    const an = Math.min(this.r.capabilities.getMaxAnisotropy(), q.anisotropy); this.an = an
    // détail gravier / herbe de près (CC0) : chargé avant les tuiles pour être appliqué dès la première ; ?det=0 pour comparer
    if (q.name !== 'low' && new URLSearchParams(location.search).get('det') !== '0') {
      try { this.detail = await loadDetail('./assets/detail/', KTX, an); dlog('détail gravier/herbe actif') } catch (e) { dlog('détail indisponible : ' + (e as Error).message) }
    }
    this.memLog('avant chargement')
    const [cg] = await Promise.all([(KTX ? loadGLB(cuK, f => { fc = f; upd() }, KTX).catch(e => { dlog('voiture KTX2 → repli WebP : ' + (e as Error).message); return loadGLB(cu, f => { fc = f; upd() }) }) : loadGLB(cu, f => { fc = f; upd() })),
      ...first.map(t => this.loadTile(t).then(() => { ft += w(t); upd() }))])
    prog('Préparation des matériaux', 1)
    this.memLog('piste + voiture analysées')
    this.tilesAtStart = this.tiles.loaded.size
    this.scene.add(this.track)
    // nuit : halos des lampadaires + quelques lumières réelles réaffectées aux lampadaires voisins (nombre FIXE → pas de recompilation des shaders) ; ?lamps=0 pour comparer
    if (CIRCUIT.night && P0.get('lamps') !== '0') {
      const ld = await loadLamps(CIRCUIT.trackDir + 'lamps.json')
      if (ld) { this.night = new NightLamps(ld, CIRCUIT.night, q.name === 'low' ? 0 : this.mobile ? 3 : 6); this.scene.add(this.night.group); dlog(`lampadaires : ${this.night.n} halos, ${this.night.lights.length} lumières`) }
    }
    this.rig = new CarRig(cg, an); this.w11G = cg; this.w11Rig = this.rig
    this.car.add(this.rig.root)
    // reflets réels de l'environnement sur la voiture (sonde cube dynamique), sinon IBL du ciel seul
    const P = new URLSearchParams(location.search)
    // WebKit (Safari, donc tout navigateur iPhone) : la sonde cube filtrée PMREM rend la carrosserie NOIRE (vu dans
    // Playwright WebKit, cause interne non trouvée) → reflets de l'IBL du ciel HDRI, propres. ?probe=128 pour forcer.
    const webkit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox|Edg\//.test(navigator.userAgent)
    const ps = P.has('probe') ? Number(P.get('probe')) : webkit ? 0 : q.probe
    this.probeSize = ps

    this.cgOff.set(game.car.cg[0], game.car.cg[1], game.car.cg[2])
    this.r.setPixelRatio(this.basePR())
    this.cams = new CameraRig(innerWidth / innerHeight, q.drawDistance, track)
    this.fx = new Effects(q.particles); this.scene.add(this.fx.group)
    this.skid = new SkidMarks(); this.rain = new RainStreaks(); this.drops = new LensDrops(); this.debrisV = new DebrisView()
    this.scene.add(this.skid.mesh, this.rain.mesh, this.debrisV.group)
    this.rig.onPartLost = (_w, p) => { for (let i = 0; i < 4; i++) this.fx.spark([p.x, p.y, p.z], game.car.vel, 2) }
    // herbe 3D en bord de piste (pas en qualité basse ; ?grass=0 pour comparer)
    if (CIRCUIT.optionalAssets.grassmask && q.name !== 'low' && new URLSearchParams(location.search).get('grass') !== '0') {
      const gm = await fetch(CIRCUIT.trackDir + 'grassmask.bin').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null)
      if (gm) this.grass = new Grass(track, gm, q.name === 'medium' ? 0.6 : 1.0, q.name === 'medium' ? 8000 : 14000, 34, this.detail?.tex.grass ?? null); if (this.grass) { this.scene.add(this.grass.mesh)
      dlog(`herbe 3D : ${this.grass.n} touffes (fenêtre ≤ ${this.grass.cap})`) }
    }
    // public des tribunes (toutes qualités : ≤ 36 triangles par personne près, 4 loin)
    if (CIRCUIT.optionalAssets.crowd && new URLSearchParams(location.search).get('crowd') !== '0') {
      const cb = await fetch(CIRCUIT.trackDir + 'crowd.bin').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null)
      if (cb) { this.crowd = new Crowd(cb); this.scene.add(this.crowd.group); dlog(`public : ${this.crowd.chunks.length} blocs`) }
    }
    // mobile : démarrage SANS composeur (cibles HalfFloat MSAA), sans sonde cube, ombre 1024 → upgrade() après stabilité
    // qualité complète dès le départ, mobile compris (composeur MSAA, ombre pleine, sonde) : le « démarrage léger »
    // rendait sans anticrénelage ni effets sur iPhone. La mémoire reste ≈ 200 Mo grâce aux textures ASTC.
    this.setupPost(); this.upgraded = true
    this.resize()
    // compile tous les shaders avant la première image (évite les saccades au premier virage)
    prog('Compilation des shaders', 1)
    this.syncCar(game, 0)
    this.cams.update(this.car, this.rig.eye, this.rig.tcam, 0, 0.016, 0, 0)
    await this.r.compileAsync(this.scene, this.cams.cam)
    if (ps > 0) this.attachProbe(ps)
    this.memLog('shaders compilés')
  }
  /** mobile : montée en qualité progressive une fois le jeu démarré et stable (composeur → ombre → sonde). */
  upgraded = false
  async upgrade() {
    if (this.upgraded || !this.mobile) return
    this.upgraded = true
    const q = this.q, wait = (ms: number) => new Promise(r => setTimeout(r, ms))
    if (q.bloom || q.gtao) { this.setupPost(); this.resize(); const f = this.fxLevel; this.fxLevel = -1; this.setFx(f); this.memLog('qualité ↑ effets (composeur)'); await wait(1500) }
    const s = this.sun.shadow; if (s.mapSize.x !== q.shadowMap && this.fxLevel < 3) { s.mapSize.set(q.shadowMap, q.shadowMap); s.map?.dispose(); s.map = null; this.memLog('qualité ↑ ombre ' + q.shadowMap); await wait(1500) }
    if (this.probeSize > 0 && this.rig && !this.probe) {
      this.attachProbe(this.probeSize)
      this.memLog('qualité ↑ reflets sonde ' + this.probeSize)
    }
  }
  /** sonde de reflets : rendu complet + PMREM vérifié AVANT de l'appliquer ; si la sortie est noire/NaN (vu sur WebKit),
   *  la voiture garde l'IBL du ciel (jamais de carrosserie noire). */
  attachProbe(size: number) {
    if (!this.rig) return
    const pr = new ReflectionProbe(size, this.q.probeEvery), ei = this.look.env * this.q.envIntensity
    const setEnv = (t: THREE.Texture | null, i: number) => this.rig!.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) if ('envMap' in mt) { mt.envMap = t; mt.envMapIntensity = i; mt.needsUpdate = true } })
    pr.onFail = () => { dlog('sonde de reflets invalide ' + JSON.stringify(pr.check) + ' → reflets du ciel'); this.probe = null; setEnv(null, 1) }
    this.probe = pr
    pr.update(this.r, this.scene, this.car.position, [this.car, this.fx.group], true)
    if (this.probe) setEnv(pr.texture, ei)
  }
  /** estimation mémoire GPU des objets dans la scène (textures uniques par source, géométries, cibles, ombre). */
  gpuEstimate() {
    const src = new Set<unknown>(), geos = new Set<THREE.BufferGeometry>(); let tex = 0, geo = 0
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      if (!geos.has(m.geometry)) { geos.add(m.geometry); for (const a of Object.values(m.geometry.attributes)) geo += (a as THREE.BufferAttribute).array?.byteLength ?? 0; geo += m.geometry.index?.array.byteLength ?? 0 }
      for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as unknown as Record<string, unknown>[]) for (const v of Object.values(mt)) {
        const t = v as THREE.Texture; if (!t || !(t as THREE.Texture).isTexture || src.has(t.source)) continue; src.add(t.source); tex += texBytes(t) } })
    const c = this.canvas, px = c.width * c.height
    const rt = px * (this.composer ? 4 : this.q.msaa ? 36 : 8) + (this.composer ? px * 8 + px * (this.q.msaa ? 56 : 12) + (this.q.gtao ? px * 0.25 * 24 : 0) + (this.bloom ? px * 7.3 : 0) : 0)
    const sh = this.sun.shadow.mapSize.x ** 2 * 4, probe = this.probe ? this.probeSize ** 2 * 6 * 8 * 1.33 : 0
    return { tex, geo, rt, sh: sh + probe, total: tex + geo + rt + sh + probe }
  }
  private memLogT = 0
  memLog(lbl: string) {
    // en jeu, une tuile qui entre ou sort ne doit pas relancer un parcours complet de la scène (pic d'image au pire moment) : au plus une estimation toutes les 20 s
    if (this.cams && lbl.startsWith('tuile ')) { const now = performance.now(); if (now - this.memLogT < 20000) return; this.memLogT = now }
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
    // arbres : normales sphériques, alpha-to-coverage affûté, vent, translucidité (src/render/trees.ts) ; ?trees=0 pour comparer
    if (P0trees()) root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      const nm = (m.name || '') + ' ' + (o.parent?.name || ''), mt = m.material as THREE.MeshStandardMaterial
      if (!TREE_RE.test(mt.name || '') && !TREE_RE.test(nm)) return
      prepTreeGeometry(m.geometry, /bush/i.test(mt.name)); prepTreeMaterial(mt, this.q.msaa) })
    // AO précalculée Cycles (COLOR_0) → éclairage indirect ; ?bao=0 pour comparer sans
    const P = new URLSearchParams(location.search), n = (k: string, d: number) => P.has(k) ? Number(P.get(k)) : d
    if (P.get('bao') !== '0') {
      const r = applyBakedAO(root, { strength: n('aok', BAKED_AO_DEFAULT.strength), ground: n('aog', BAKED_AO_DEFAULT.ground), direct: n('aod', BAKED_AO_DEFAULT.direct), floor: n('aof', BAKED_AO_DEFAULT.floor) })
      this.bakedAO = { meshes: (this.bakedAO?.meshes ?? 0) + r.meshes, materials: (this.bakedAO?.materials ?? 0) + r.materials }
    } else stripBakedAO(root)
    if (this.detail && !lod) { const det = this.detail; root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      for (const mt of (Array.isArray(m.material) ? m.material : [m.material])) applyDetail(mt as THREE.MeshStandardMaterial, det) }) }
    root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mt of (Array.isArray(m.material) ? m.material : [m.material])) if ((mt as THREE.MeshStandardMaterial).isMeshStandardMaterial) applyWet(mt as THREE.MeshStandardMaterial) })
    if (new URLSearchParams(location.search).get('weather') !== '0') root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      for (const mt of (Array.isArray(m.material) ? m.material : [m.material])) if ((mt as THREE.MeshStandardMaterial).isMeshStandardMaterial) applyWeathering(mt as THREE.MeshStandardMaterial) })
    root.name = 'tile_' + t.id + (lod ? '_lod' : '')
    root.updateMatrixWorld(true)
    if (this.cams) { // streaming en jeu : shaders compilés et textures envoyées au GPU avant l'ajout (pas de saccade visible)
      await this.r.compileAsync(root, this.cams.cam, this.scene)
      const texs = new Set<THREE.Texture>()
      root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
        for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'] as const) if (mt[k]) texs.add(mt[k]!) })
      // envoi au GPU étalé : une grosse texture d'un coup = un pic d'image ; on travaille ~4 ms puis on rend la main (les images continuent d'être dessinées)
      let tu = performance.now()
      for (const tx of texs) { this.r.initTexture(tx); if (performance.now() - tu > 4) { await new Promise<void>(res => setTimeout(res, 0)); tu = performance.now() } }
    }
    this.swapPlaceholders(root)
    this.track!.add(root)
    this.onTile?.(root)
    if (lod) this.lodIn.set(t.id, root); else { this.tiles!.loaded.add(t.id); this.tiles!.bytes += t.geoBytes }
    this.lastTile = t.id + (lod ? ' (LOD)' : '')
    if (this.cams) this.memLog('tuile ' + this.lastTile + ' ajoutée')
  }
  lodIn = new Map<string, THREE.Object3D>(); dbgDone = false
  skK = [0, 0, 0, 0]
  skid!: SkidMarks; rain!: RainStreaks; drops!: LensDrops; debrisV!: DebrisView
  private wx: { sid: number; base: { skyI: number; haze: number; fog: number; fogC: THREE.Color; sun: number; env: number; hemi: number } | null; cloud: number; nDeb: number; w?: string } = { sid: -1, base: null, cloud: -1, nDeb: 0 }
  /** météo visuelle : ciel couvert, brouillard, soleil voilé, chaussée mouillée ; traces, gerbes, pluie, gouttes, débris */
  private weatherFrame(game: Game, dt: number) {
    const e = game.env, c = game.car, X = this.wx
    if (X.sid !== game.sessionId) { X.sid = game.sessionId; this.skid.clear(); X.nDeb = 0 }
    if (!X.base) { const fog = this.scene.fog as THREE.FogExp2 | null
      X.base = { skyI: this.dome?.mat.uniforms.uI.value ?? 1, haze: this.dome?.mat.uniforms.uHaze.value ?? 0.35, fog: fog?.density ?? 0.0003, fogC: fog ? fog.color.clone() : new THREE.Color(0.6, 0.65, 0.7), sun: this.sun.intensity, env: this.scene.environmentIntensity, hemi: this.hemi.intensity } }
    const B = X.base
    const snap = X.w !== e.weather; X.w = e.weather // changement de météo (réglage) : ciel et chaussée basculent tout de suite
    X.cloud = X.cloud < 0 || snap ? e.cloud : X.cloud + (e.cloud - X.cloud) * Math.min(1, dt * 0.5)
    const co = Math.max(0, (X.cloud - 0.3) / 0.7)
    if (this.dome) { this.dome.mat.uniforms.uI.value = B.skyI * (1 - 0.55 * co); this.dome.mat.uniforms.uHaze.value = B.haze + 0.5 * co }
    const fog = this.scene.fog as THREE.FogExp2 | null
    if (fog) { fog.density = B.fog * (1 + 2 * co * co + 2.5 * Math.min(1, e.rainRate / 9)); fog.color.copy(B.fogC).lerp(new THREE.Color(0.36, 0.38, 0.41), co) }
    this.sun.intensity = B.sun * (1 - 0.9 * co); this.scene.environmentIntensity = B.env * (1 - 0.5 * co); this.hemi.intensity = B.hemi * (1 + 1.1 * co)
    const wetT = Math.min(1, Math.max(e.wetness / 0.35, e.rainRate > 0 ? 0.55 + e.rainRate / 20 : 0))
    wetU.uWet.value = snap ? wetT : wetU.uWet.value + (wetT - wetU.uWet.value) * Math.min(1, dt * 0.3)
    // traces / gerbes par roue
    const wetK = 1 - 0.8 * Math.min(1, e.wetness / 0.3)
    for (let i = 0; i < 4; i++) { const w = c.wheels[i]; if (!w.contact) { this.skid.add(i, [0, 0, 0], 0, 0, 0); continue }
      const vx = Math.abs(w.omega * w.r) + 0.1, lockK = c.brakeApplied > 0.1 && c.speed > 6 && Math.abs(w.omega * w.r) < c.speed * 0.55 ? 1 : 0
      const slideK = Math.max(0, Math.min(1, (Math.abs(w.alpha) - W11.tyre.aPeak * 1.25) / 0.12)) * Math.min(1, c.speed / 15)
      const spinK = Math.max(0, Math.min(1, (w.kappa - W11.tyre.kPeak * 1.5) / 0.5)) * Math.min(1, vx / 8)
      const off = w.type === 4 || w.type === 5
      const k0 = off ? (c.speed > 3 ? 0.7 : 0) : Math.max(lockK, slideK, spinK) * wetK
      const k = this.skK[i] = c.speed < 1 ? 0 : Math.max(k0, this.skK[i] - dt * 5) // maintien ~0,15 s : la roue qui bloque/débloque laisse une trace continue
      this.skid.add(i, [w.px, w.py, w.pz], w.front ? W11.tyreWidthF : W11.tyreWidthR, k, off ? (w.type === 5 ? 1 : 2) : 0)
      const water = e.water[e.idx(w.sample.s, w.sample.d)]
      if (water > 0.08 && c.speed > 12 && !w.front) this.fx.sprayAt(w.px, w.py, w.pz, c.vel, Math.min(1.5, water * 1.2) * Math.min(1, c.speed / 60))
    }
    this.rain.update(this.cams.cam.position, performance.now() / 1000, e.rainRate, e.wind, c.vel)
    this.drops.update(dt, this.cams.mode === 'cockpit' && !game.paused, e.rainRate, c.speed)
    // débris : apparition → étincelles + fumée ; roue arrachée → la coque racle
    if (game.debris.length > X.nDeb) { for (const d of game.debris.slice(X.nDeb)) { this.fx.spark(d.pos, c.vel, 2.5); this.fx.burst(d.pos, c.vel, 6) } }
    X.nDeb = game.debris.length
    this.debrisV.update(game)
  }
  show = new Showroom(); showPanel = 0.46
  private studioEnv: THREE.WebGLRenderTarget | null = null
  /** studio : environnement « boîtes à lumière » (RoomEnvironment → PMREM, ~3 Mo) créé à l'entrée du menu, libéré avant la course */
  enterShowroom() {
    if (!this.rig) return
    if (!this.studioEnv) { const pm = new THREE.PMREMGenerator(this.r); const room = new RoomEnvironment(); this.studioEnv = pm.fromScene(room, 0.04); pm.dispose(); room.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose() } }) }
    this.show.enter(this.car, this.studioEnv.texture); this.rig.setCockpit(false); this.ckPrev = false
  }
  exitShowroom() { this.show.exit(this.car); this.studioEnv?.dispose(); this.studioEnv = null }
  /** image du menu : studio seul (la piste n'est pas dessinée), même chaîne de rendu que la course */
  showroomFrame(dt: number) {
    const S = this.show; S.update(dt, innerWidth / innerHeight, this.showPanel)
    this.r.info.reset()
    if (this.composer) { const C = this.composer, rp = C.passes[0] as unknown as { scene: THREE.Scene; camera: THREE.Camera }
      const s0 = rp.scene, c0 = rp.camera; rp.scene = S.scene; rp.camera = S.cam; C.readBuffer = C.renderTarget1; C.writeBuffer = C.renderTarget2; C.render(dt); rp.scene = s0; rp.camera = c0 }
    else this.r.render(S.scene, S.cam)
  }
  private drvKtx: KTX2Loader | null = null
  /** textures pilote (KTX2 dans tous les cas : les fichiers PNG ne sont pas publiés) */
  loadDriverTex = (url: string): Promise<THREE.Texture> => {
    const L = KTX ?? (this.drvKtx ??= new KTX2Loader().setTranscoderPath('./basis/').setWorkerLimit(2).detectSupport(this.r))
    return L.loadAsync(url) as Promise<THREE.Texture>
  }
  setDriver(id: string, hasSuit = true) { return this.rig?.setDriver(id, this.loadDriverTex, hasSuit) ?? Promise.resolve() }
  /** Lot 8 — voiture d'équipe : GLB public/cars/<id>_hi.glb (tools/team_cars_opt.mjs) + pilote W11 greffé (armature DRV_rig,
   *  volant, clip « steer ») à l'offset du siège mesuré dans Blender (t1_team_car.py → <id>.json). Le pilote n'existe qu'une fois :
   *  il est déplacé d'une voiture à l'autre (textures pilote conservées). La voiture précédente (hors W11) est libérée du GPU. */
  carId = 'w11'; private w11G: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null = null; private w11Rig: CarRig | null = null
  private carSeq = 0; private inflight: string | null = null
  /** rigs déjà décodés (2 max) : le retour sur une voiture déjà vue est instantané, et un chargement périmé ne s'affiche pas */
  private park = new Map<string, { rig: CarRig; seat: number[] }>()
  private drvHome: { o: THREE.Object3D; parent: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[] = []
  onCarChanged: (() => void) | null = null
  carMeta: Record<string, unknown> | null = null
  ktxAny() { return KTX ?? (this.drvKtx ??= new KTX2Loader().setTranscoderPath('./basis/').setWorkerLimit(2).detectSupport(this.r)) }
  private moveDriver(dst: THREE.Object3D | null, seat: number[]) {
    const src = this.w11Rig!.root
    if (!this.drvHome.length) for (const n of ['DRV_rig', 'STEERING_WHEEL']) { const o = src.getObjectByName(n); if (o) this.drvHome.push({ o, parent: o.parent!, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }) }
    if (!dst) { for (const h of this.drvHome) { h.parent.add(h.o); h.o.position.copy(h.p); h.o.quaternion.copy(h.q); h.o.scale.copy(h.s) } return }
    // pose de référence : la pièce remise chez la W11, matrice relative à la racine W11 → même matrice relative au siège
    for (const h of this.drvHome) { h.parent.add(h.o); h.o.position.copy(h.p); h.o.quaternion.copy(h.q); h.o.scale.copy(h.s) }
    src.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(src.matrixWorld).invert()
    const seatG = new THREE.Group(); seatG.name = 'driver_seat'; seatG.position.fromArray(seat); dst.add(seatG)
    for (const h of this.drvHome) { const m = new THREE.Matrix4().multiplyMatrices(inv, h.o.matrixWorld); seatG.add(h.o); m.decompose(h.o.position, h.o.quaternion, h.o.scale) }
  }
  async setCar(id: string) {
    if (!this.rig || !this.w11Rig || !this.w11G) return
    if (id === this.carId && this.inflight === null) return
    const seq = ++this.carSeq
    this.inflight = id
    const prevId = this.carId
    const prevSeat = [ ...(((this.carMeta as { seat_gltf?: number[] } | null)?.seat_gltf) ?? [0, 0, 0]) ]
    let rig: CarRig
    let seat: number[] = [0, 0, 0]
    if (id === 'w11') { this.moveDriver(null, [0, 0, 0]); rig = this.w11Rig; this.carMeta = null }
    else if (this.park.has(id)) {
      const hit = this.park.get(id)!; this.park.delete(id)
      seat = hit.seat; this.moveDriver(hit.rig.root, seat); rig = hit.rig
    } else {
      const meta = await (await fetch(`./cars/${id}.json`)).json() as { seat_gltf: number[]; tcam_gltf: number[] }
      const g = await loadGLB(`./cars/${id}_hi.glb`, () => {}, this.ktxAny())
      seat = meta.seat_gltf
      if (seq !== this.carSeq) { this.stash(id, new CarRig({ scene: g.scene, animations: this.w11G.animations }, this.an, { tcam: meta.tcam_gltf }), seat); return }
      this.moveDriver(g.scene, meta.seat_gltf)
      rig = new CarRig({ scene: g.scene, animations: this.w11G.animations }, this.an, { tcam: meta.tcam_gltf })
      this.carMeta = meta
    }
    if (seq !== this.carSeq) { if (id !== 'w11') this.stash(id, rig!, seat); return }
    const old = this.rig
    if (old !== this.w11Rig && old !== rig!) { if (prevId !== 'w11' && prevId !== id) this.stash(prevId, old, prevSeat) }
    rig!.adoptDriver(old); rig!.onPartLost = old.onPartLost
    this.car.remove(old.root); this.car.add(rig!.root); this.rig = rig!
    if (this.probe) { const t = this.probe.texture, ei = this.look.env * this.q.envIntensity; rig!.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
      for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) if ('envMap' in mt) { mt.envMap = t; mt.envMapIntensity = ei; mt.needsUpdate = true } }) }
    if (this.show.active) { rig!.setCockpit(false); this.show.refit(this.car) }
    this.carId = id; this.inflight = this.inflight === id ? null : this.inflight
    dlog('voiture : ' + id); this.onCarChanged?.()
  }
  private stash(id: string, rig: CarRig, seat: number[]) {
    if (this.park.has(id)) return
    this.park.set(id, { rig, seat })
    while (this.park.size > 2) { const k = this.park.keys().next().value!; const old = this.park.get(k)!; this.park.delete(k); disposeTree(old.rig.root) }
  }
  /** libère les voitures en cache au départ en course (mémoire iPhone) */
  releaseCarCache() { for (const [, v] of this.park) disposeTree(v.rig.root); this.park.clear() }
  detail: DetailSet | null = null
  grass: Grass | null = null
  crowd: Crowd | null = null
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
  /** après « Prêt » : toutes les textures KTX2 de la piste téléchargées en arrière-plan (3 à la fois) dans le cache HTTP /
   *  service worker → les tuiles suivantes arrivent complètes sans attendre le réseau. Aucun envoi au GPU ici. */
  prefetched = 0
  private async prefetchTextures() {
    if (!KTX) return
    const ids = Object.keys(KTX_LIST); let i = 0
    const one = async () => { while (i < ids.length) { const id = ids[i++]; try { const r = await fetch(TRACK_DIR + 'tex/' + id + '.ktx2'); await r.arrayBuffer(); this.prefetched++ } catch { /* réessayé au chargement de la tuile */ } } }
    await Promise.all([one(), one(), one()])
    dlog('textures piste en cache : ' + this.prefetched + '/' + ids.length)
  }
  /** tuiles restantes en arrière-plan, la plus proche de la voiture d'abord (recalculé à chaque tuile). */
  async streamTiles(game: Game) {
    if (this.streaming || !this.tiles) return
    this.streaming = true
    lazyGo()
    void this.prefetchTextures()
    // toutes les plateformes : tuiles proches en pleine qualité, le lointain en LOD (le frustum ne charge pas 1,3 M de triangles)
    return this.streamNear(game)
  }
  /** mobile : seules les tuiles à moins de NEAR_MOB m de la voiture sont dans la scène (au GPU) ; au-delà de FAR_MOB elles
   *  sont retirées et leurs tampons GPU libérés (géométrie gardée en mémoire JS → ré-ajout sans nouveau téléchargement).
   *  Une seule opération par pas (≥ 250 ms) → envois au GPU étalés sur plusieurs images. Le décor « base » reste. */
  private async streamNear(game: Game) {
    // pleine qualité < FULL m ; LOD (géométrie simplifiée, mêmes textures) jusqu'à AHEAD m devant / BEHIND m derrière ; au-delà retirée
    const mobile = this.mobile, hasLods = CIRCUIT.hasLods
    const FULL = mobile ? 600 : 850, AHEAD = mobile ? 1500 : 2000, BEHIND = mobile ? 800 : 1100, HYST = 200
    const T = this.tiles!, wait = (ms: number) => new Promise(r => setTimeout(r, ms))
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
      const lodT = hasLods ? tl.filter(t => !full(t) && !this.lodIn.has(t.id) && d(t) < lim(t)).sort((a, b) => d(a) - d(b))[0] : undefined
      if (lodT) { try { await this.loadTile(lodT, true) } catch (e) { dlog('LOD ' + lodT.id + ' : ' + (e as Error).message); await wait(3000) } continue }
      // 4) pleine qualité → LOD quand la tuile s'éloigne
      const dn = tl.find(t => full(t) && d(t) > FULL + HYST && d(t) < lim(t))
      if (hasLods && dn) { if (!this.lodIn.has(dn.id)) try { await this.loadTile(dn, true) } catch (e) { dlog('LOD ' + dn.id + ' : ' + (e as Error).message) }
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
    // mémoire : un seul tampon MSAA ×4 + profondeur (la scène y est toujours rendue, cf. frame()) ; le second tampon de
    // l'enchaînement est simple et sans profondeur (avant : deux tampons MSAA ×4 + profondeur clonés → ~115 Mo de plus à 2121×980)
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa ? 4 : 0 })
    this.composer = new EffectComposer(this.r, rt)
    const rt2 = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0, depthBuffer: false })
    this.composer.renderTarget2.dispose(); this.composer.renderTarget2 = rt2
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
      uniforms: { tDiffuse: { value: null }, sat: { value: this.look.sat }, con: { value: this.look.con }, cas: { value: CAS } },
      // NaN/Inf : remplacé par la moyenne des voisins valides (et non du noir) → aucun point noir (vu sous WebKit sur la carrosserie)
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
// + étalonnage léger en linéaire HDR, avant ACES (même passe → coût nul) : saturation et contraste autour d'un gris moyen
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float sat, con, cas; varying vec2 vUv; bool bad3(vec3 v){ return any(isnan(v)) || any(isinf(v)); } void main(){ vec4 c = texture2D(tDiffuse, vUv); if (bad3(c.rgb)) { vec2 px = 1.0 / vec2(textureSize(tDiffuse, 0)); vec3 acc = vec3(0.0); float n = 0.0; for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236; vec3 v = texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * px * (i < 4 ? 1.0 : i < 8 ? 2.5 : 5.0)).rgb; if (!bad3(v)) { acc += min(v, vec3(48.0)); n += 1.0; } } c.rgb = n > 0.0 ? acc / n : vec3(0.0); } c.rgb = clamp(c.rgb, 0.0, 48.0); if (cas > 0.0) { vec2 px = 1.0 / vec2(textureSize(tDiffuse, 0)); vec3 n0 = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb, n1 = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb, n2 = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, n3 = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb; if (!(bad3(n0) || bad3(n1) || bad3(n2) || bad3(n3))) { vec3 t = c.rgb / (1.0 + c.rgb), a0 = n0 / (1.0 + n0), a1 = n1 / (1.0 + n1), a2 = n2 / (1.0 + n2), a3 = n3 / (1.0 + n3); vec3 mn = min(t, min(min(a0, a1), min(a2, a3))), mx = max(t, max(max(a0, a1), max(a2, a3))); vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0)); vec3 w = -amp * cas; vec3 r = (t + (a0 + a1 + a2 + a3) * w) / (1.0 + 4.0 * w); r = clamp(r, 0.0, 0.999); c.rgb = r / (1.0 - r); } } float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = max(mix(vec3(l), c.rgb, sat), 0.0); c.rgb = 0.22 * pow(c.rgb / 0.22, vec3(con)); gl_FragColor = vec4(min(c.rgb, 48.0), 1.0); }',
    }))
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.08, 0.15, 30.0); this.composer.addPass(this.bloom) }
    this.composer.addPass(new OutputPass())
  }
  resize() {
    const w = innerWidth, h = innerHeight
    this.r.setSize(w, h, false)
    const pr = this.basePR() * this.scale
    this.r.setPixelRatio(pr)
    if (this.cams) { this.cams.cam.aspect = w / h; this.cams.cam.updateProjectionMatrix() }
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h) }
    if (this.gtao) this.gtao.setSize(Math.round(w * pr * this.q.gtaoScale), Math.round(h * pr * this.q.gtaoScale))
    if (this.fx) this.fx.setScale(h * pr)
  }
  /** densité de pixels : natif plafonné par le budget de pixels du préréglage (1080p ou 2K) et par dprMax */
  basePR() { const n = window.devicePixelRatio || 1, px = innerWidth * innerHeight; return Math.max(1, Math.min(n, this.q.dprMax, Math.sqrt(this.q.pxBudget / Math.max(1, px)))) }
  setScale(s: number) { this.scale = s; this.resize() }
  /** Pose interpolée : physique (CG) → origine du modèle (sol, milieu d'empattement). */
  syncCar(game: Game, _dt: number) {
    const p = game.pose(this.pose)
    this.car.quaternion.set(p.q[0], p.q[1], p.q[2], p.q[3])
    this.v3.copy(this.cgOff).applyQuaternion(this.car.quaternion)
    this.car.position.set(p.pos[0] - this.v3.x, p.pos[1] - this.v3.y + (game.pitShow?.lift ?? 0), p.pos[2] - this.v3.z)
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
      else if (w.type >= 4 && w.type <= 5 && c.speed > 4) this.fx.offroad(w.px, w.py, w.pz, c.vel, c.speed, w.type)
    }
    this.weatherFrame(game, dt)
    this.fx.update(dt)
    treeUniforms.uTime.value = performance.now() / 1000
    this.cams.shake = shake
    const follow = this.camFollow ?? this.car
    this.cams.update(follow, this.rig.eye, this.rig.tcam, c.speed, dt, c.gLat, c.gLong)
    this.night?.update(this.car.position, this.cams.cam, this.canvas.height)
    this.crowd?.update(this.cams.cam.position)
    this.grass?.update(this.cams.cam.position, Math.max(0, this.grass.lastI), performance.now() / 1000)
    // pilote masqué en cockpit (la caméra est dans sa tête)
    const ck = this.cams.mode === 'cockpit'; if (ck !== this.ckPrev) { this.ckPrev = ck; this.rig.setCockpit(ck) }
    // ombres : la caméra d'ombre suit la voiture, recalée sur la grille de texels (pas de scintillement)
    const R = this.q.shadowRange, tex = (2 * R) / this.sun.shadow.mapSize.x
    const cx = follow.position.x, cz = follow.position.z
    const lx = Math.round(cx / tex) * tex, lz = Math.round(cz / tex) * tex
    this.sun.target.position.set(lx, follow.position.y, lz)
    this.sun.position.set(lx + this.sunDir.x * 150, follow.position.y + this.sunDir.y * 150, lz + this.sunDir.z * 150)
    this.sun.target.updateMatrixWorld()
    treeUniforms.uSunV.value.copy(this.sunDir).transformDirection(this.cams.cam.matrixWorldInverse)
    this.probe?.update(this.r, this.scene, this.car.position, [this.car, this.fx.group])
    if (DBG_OVR === 'nomap' && !this.dbgDone) { this.dbgDone = true; this.rig.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as unknown as Record<string, unknown>[]) { for (const k of Object.keys(mt)) if ((mt[k] as THREE.Texture)?.isTexture) mt[k] = null; (mt as unknown as THREE.Material).needsUpdate = true } }) }
    if ((DBG_OVR === 'an1' || DBG_OVR === 'nomip') && !this.dbgDone) { this.dbgDone = true; this.rig.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as unknown as Record<string, unknown>[]) { for (const k of Object.keys(mt)) { const t = mt[k] as THREE.Texture; if (t?.isTexture) { t.anisotropy = 1; if (DBG_OVR === 'nomip') t.minFilter = THREE.LinearFilter; t.needsUpdate = true } } } }) }
    if (DBG_OVR === 'fs' && !this.dbgDone) { this.dbgDone = true; this.rig.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mt of (Array.isArray(m.material) ? m.material : [m.material])) { mt.side = THREE.FrontSide; mt.needsUpdate = true } }) }
    if (DBG_OVR && DBG_OVR.length === 1 && !this.scene.overrideMaterial) this.scene.overrideMaterial = DBG_OVR === 'n' ? new THREE.MeshNormalMaterial() : DBG_OVR === 's' ? new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4, metalness: 0.5 }) : DBG_OVR === 'd' ? new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }) : DBG_OVR === 'l' ? new THREE.MeshLambertMaterial({ color: 0xcccccc }) : new THREE.MeshBasicMaterial({ color: 0xffffff })
    if (this.composer) { const C = this.composer; C.readBuffer = C.renderTarget1; C.writeBuffer = C.renderTarget2; C.render(dt) }
    else this.r.render(this.scene, this.cams.cam)
  }
}
