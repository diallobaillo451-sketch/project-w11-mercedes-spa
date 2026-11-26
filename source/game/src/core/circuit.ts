/** Circuit actif : choisi au démarrage (?circuit=<id>, mémorisé dans le navigateur) ; changer de circuit = recharger la page.
 *  Hors navigateur (tests Node) : Spa. Configurations reprises du bundle live gh-pages, sans réestimation des valeurs. */
import type { NightLook } from '../render/night.ts'

export type CircuitId = 'spa' | 'monza' | 'barcelona' | 'sepang' | 'silverstone' | 'marina' | 'redbull' | 'bahrain' | 'hungaroring' | 'interlagos' | 'imola' | 'albertpark'

export interface Circuit {
  id: CircuitId
  name: string
  /** surface, barrières, voie des stands, herbe, public */
  trackDir: string
  /** tuiles 3D (tiles.json, *.gltf, tex/) */
  sceneDir: string
  /** postes de commissaires (JSON), null : aucun */
  marshals: string | null
  /** stands 3D de Spa (garages, PNJ, feux de sortie, lampes de commissaires) : Spa seulement */
  spaPits: boolean
  /** ressources spécifiques présentes sur disque (évite les requêtes 404 facultatives) */
  optionalAssets: { barriers: boolean; pitlane: boolean; grassmask: boolean; crowd: boolean }
  /** les tuiles ont des variantes géométriques simplifiées pour le streaming lointain */
  hasLods: boolean
  /** début et fin de la limitation à 80 km/h dans la voie des stands (s piste) */
  pit: { limitFromS: number; limitToS: number }
  /** fins des secteurs 1 et 2 (s piste) */
  gates: [number, number]
  /** zones DRS [début, fin] en s piste (une zone qui passe la ligne est coupée en deux) */
  drs: (length: number) => [number, number][]
  /** dossier du ciel (sky.json, sky_4k.webp) ; absent : ./assets/sky/ (ciel de jour commun) */
  skyDir?: string
  /** circuit de nuit (Marina Bay) : lune, ciel, lampadaires ; absent : jour */
  night?: NightLook
}

// Chemins et paramètres ci-dessous sont ceux du bundle publié sur gh-pages ; ils n'ont pas été re-mesurés ici.
export const CIRCUITS: Record<CircuitId, Circuit> = {
  spa: {
    id: 'spa', name: 'Spa-Francorchamps', trackDir: './track/', sceneDir: './assets/spa/', marshals: './assets/spa_pits/marshals.json', spaPits: true,
    optionalAssets: { barriers: true, pitlane: true, grassmask: true, crowd: true }, hasLods: true,
    pit: { limitFromS: 6790, limitToS: 200 }, gates: [2050, 5000],
    drs: length => { const k = length / 7001.7; return [[1380 * k, 2230 * k], [6790 * k, length], [0, 190 * k]] },
  },
  monza: {
    id: 'monza', name: 'Monza', trackDir: './track_monza/', sceneDir: './assets/monza/', marshals: './track_monza/marshals.json', spaPits: false,
    optionalAssets: { barriers: true, pitlane: true, grassmask: true, crowd: true }, hasLods: true,
    pit: { limitFromS: 5405, limitToS: 70 }, gates: [1600, 3950],
    drs: length => [[2738, 3560], [5589, length], [0, 480]],
  },
  barcelona: {
    id: 'barcelona', name: 'Barcelone-Catalogne', trackDir: './track_barcelona/', sceneDir: './assets/barcelona/', marshals: null, spaPits: false,
    optionalAssets: { barriers: true, pitlane: true, grassmask: true, crowd: true }, hasLods: true,
    pit: { limitFromS: 4245, limitToS: 329 }, gates: [1610, 3384],
    drs: length => { const k = length / 4642.814; return [[4412 * k, length], [0, 555 * k], [2966 * k, 3266 * k]] },
  },
  sepang: {
    id: 'sepang', name: 'Sepang', trackDir: './track_sepang/', sceneDir: './assets/sepang/', marshals: null, spaPits: false,
    optionalAssets: { barriers: true, pitlane: true, grassmask: true, crowd: true }, hasLods: false,
    pit: { limitFromS: 5322, limitToS: 395 }, gates: [1790, 3690],
    drs: length => [[4290, 5040], [5250, length], [0, 520]],
  },
  silverstone: {
    id: 'silverstone', name: 'Silverstone', trackDir: './track_silverstone/', sceneDir: './assets/silverstone/', marshals: null, spaPits: false,
    optionalAssets: { barriers: false, pitlane: true, grassmask: false, crowd: false }, hasLods: false,
    pit: { limitFromS: 5678, limitToS: 320 }, gates: [1750, 4500],
    drs: length => { const k = length / 5905.6; return [[5700 * k, length], [0, 200 * k], [1150 * k, 1700 * k]] },
  },
  marina: {
    id: 'marina', name: 'Marina Bay (nuit)', trackDir: './track_marina/', sceneDir: './assets/marina/', marshals: null, spaPits: false,
    optionalAssets: { barriers: false, pitlane: true, grassmask: true, crowd: false }, hasLods: false,
    pit: { limitFromS: 4880, limitToS: 180 }, gates: [1600, 3350],
    drs: length => { const k = length / 5022.6; return [[4880 * k, length], [0, 255 * k], [2985 * k, 3400 * k], [945 * k, 1290 * k]] },
    skyDir: './assets/marina/sky/',
    night: { moon: 0.5, moonColor: 0xa9bfff, exp: 0.8, env: 0.65, hemi: 0.1, skyI: 0.4, fog: 0.0008, moonDisk: 0.35, glow: 1.0, glowSize: 1.6, lampI: 350, lampRange: 60 },
  },
  redbull: {
    id: 'redbull', name: 'Red Bull Ring', trackDir: './track_redbull/', sceneDir: './assets/redbull/', marshals: null, spaPits: false,
    optionalAssets: { barriers: true, pitlane: false, grassmask: true, crowd: true }, hasLods: false,
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1352, 2705],
    drs: length => { const k = length / 4057.8; return [[3600 * k, length], [0, 230 * k], [500 * k, 1060 * k], [1420 * k, 1830 * k]] },
  },
  bahrain: {
    id: 'bahrain', name: 'Bahrain International Circuit', trackDir: './track_bahrain/', sceneDir: './assets/bahrain/', marshals: null, spaPits: false,
    optionalAssets: { barriers: true, pitlane: false, grassmask: true, crowd: true }, hasLods: false,
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1794, 3588],
    drs: length => { const k = length / 5382.0; return [[5030 * k, length], [0, 690 * k], [1150 * k, 1490 * k], [4440 * k, 4880 * k]] },
  },
  hungaroring: {
    id: 'hungaroring', name: 'Hungaroring', trackDir: './track_hungaroring/', sceneDir: './assets/hungaroring/', marshals: null, spaPits: false,
    optionalAssets: { barriers: true, pitlane: false, grassmask: true, crowd: true }, hasLods: false,
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1454, 2909],
    drs: length => { const k = length / 4363.2; return [[4040 * k, length], [0, 380 * k], [1230 * k, 1560 * k]] },
  },
  interlagos: {
    id: 'interlagos', name: 'Interlagos', trackDir: './track_interlagos_2023_v2/', sceneDir: './assets/interlagos_2023_v2/', marshals: null, spaPits: false,
    optionalAssets: { barriers: false, pitlane: false, grassmask: false, crowd: false }, hasLods: false,
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1436.3, 2872.7], drs: () => [],
  },
  imola: {
    id: 'imola', name: 'Imola', trackDir: './track_imola_2024/', sceneDir: './assets/imola_2024/', marshals: null, spaPits: false,
    optionalAssets: { barriers: true, pitlane: false, grassmask: true, crowd: true }, hasLods: false,
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1628, 3257],
    drs: length => { const k = length / 4885.2; return [[4270 * k, length], [0, 620 * k], [870 * k, 1350 * k]] },
  },
  albertpark: {
    id: 'albertpark', name: 'Albert Park (Melbourne)', trackDir: './track_albert_park_2018/', sceneDir: './assets/albert_park_2018/', marshals: null, spaPits: false,
    optionalAssets: { barriers: true, pitlane: false, grassmask: true, crowd: true }, hasLods: false,
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1766, 3531],
    drs: length => { const k = length / 5297.4; return [[5043 * k, length], [0, 430 * k], [820 * k, 1170 * k], [3030 * k, 3470 * k]] },
  },
}

/** code GP 2020 utilisé par la simulation IA ; valeurs inconnues conservées avec le fallback existant de Spa. */
export const CIRCUIT_GP_CODE: Record<CircuitId, string> = {
  spa: 'bel', monza: 'ita', barcelona: 'esp', sepang: 'mys', silverstone: 'gbr', marina: 'sgp',
  redbull: 'aut', bahrain: 'bhr', hungaroring: 'hun', interlagos: 'bra', imola: 'emi', albertpark: 'mel',
}

const KEY = 'w11.circuit'
const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
/** circuits proposés par le bouton seulement si le build a leurs données ; ?circuit=<id> reste accepté. */
const ENABLED: Record<CircuitId, boolean> = {
  spa: true, monza: true, barcelona: true,
  sepang: ENV.VITE_SEPANG === '1', silverstone: ENV.VITE_SILVERSTONE === '1', marina: ENV.VITE_MARINA === '1',
  redbull: ENV.VITE_REDBULL === '1', bahrain: ENV.VITE_BAHRAIN === '1', hungaroring: ENV.VITE_HUNGARORING === '1',
  interlagos: ENV.VITE_INTERLAGOS === '1', imola: ENV.VITE_IMOLA === '1', albertpark: ENV.VITE_ALBERT_PARK === '1',
}
function isCircuitId(id: string | null): id is CircuitId { return id !== null && Object.prototype.hasOwnProperty.call(CIRCUITS, id) }
function pick(): CircuitId {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('circuit') : null
    if (isCircuitId(q)) { localStorage.setItem(KEY, q); return q }
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (isCircuitId(stored) && ENABLED[stored]) return stored
  } catch { /* stockage indisponible : Spa */ }
  return 'spa'
}
export const CIRCUIT: Circuit = CIRCUITS[pick()]
/** bascule dans l'ordre du bundle live, parmi les circuits assemblés, puis recharge la page. */
export function switchCircuit() {
  const ids = (Object.keys(CIRCUITS) as CircuitId[]).filter(id => ENABLED[id])
  const index = ids.indexOf(CIRCUIT.id)
  const next = ids[(index + 1 + ids.length) % ids.length] ?? 'spa'
  try { localStorage.setItem(KEY, next) } catch { /* ignoré */ }
  const u = new URL(location.href); u.searchParams.set('circuit', next); location.href = u.toString()
}
