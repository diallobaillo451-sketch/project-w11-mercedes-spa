/** Circuit actif. Choisi au démarrage (?circuit=spa|monza|barcelona|sepang|silverstone|marina, mémorisé dans le navigateur) : changer de circuit = recharger la page.
 *  Hors navigateur (tests Node) : Spa. */
import type { NightLook } from '../render/night.ts'
export interface Circuit {
  id: 'spa' | 'monza' | 'barcelona' | 'sepang' | 'silverstone' | 'marina'
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
  /** circuit de nuit (Marina Bay) : lune, ciel, lampadaires (src/render/night.ts) ; absent : jour */
  night?: NightLook
}
export const CIRCUITS: Record<Circuit['id'], Circuit> = {
  spa: {
    id: 'spa', name: 'Spa-Francorchamps', trackDir: './track/', sceneDir: './assets/spa/', marshals: './assets/spa_pits/marshals.json', spaPits: true,
    optionalAssets: { barriers: true, pitlane: true, grassmask: true, crowd: true }, hasLods: true,
    pit: { limitFromS: 6790, limitToS: 200 }, gates: [2050, 5000],
    // Spa 2020 (E : positions estimées sur notre ligne centrale ; 2 zones : Kemmel, ligne droite des stands)
    drs: length => { const k = length / 7001.7; return [[1380 * k, 2230 * k], [6790 * k, length], [0, 190 * k]] },
  },
  monza: {
    id: 'monza', name: 'Monza', trackDir: './track_monza/', sceneDir: './assets/monza/', marshals: './track_monza/marshals.json', spaPits: false,
    optionalAssets: { barriers: true, pitlane: true, grassmask: true, crowd: true }, hasLods: true,
    pit: { limitFromS: 5405, limitToS: 70 }, gates: [1600, 3950],
    // FIA 2020 : zone 1 après Lesmo 2 jusqu'au freinage d'Ascari, zone 2 de la Parabolica à la Variante del Rettifilo (E)
    drs: length => [[2738, 3560], [5589, length], [0, 480]],
  },
  barcelona: {
    id: 'barcelona', name: 'Barcelone-Catalogne', trackDir: './track_barcelona/', sceneDir: './assets/barcelona/', marshals: null, spaPits: false,
    optionalAssets: { barriers: true, pitlane: true, grassmask: true, crowd: true }, hasLods: true,
    pit: { limitFromS: 4245, limitToS: 329 }, gates: [1610, 3384],
    // Positions de l'archive 2023 : secteurs, DRS et limites de stands restent des estimations, pas des relevés officiels.
    drs: length => { const k = length / 4642.814; return [[4412 * k, length], [0, 555 * k], [2966 * k, 3266 * k]] },
  },
  sepang: {
    id: 'sepang', name: 'Sepang', trackDir: './track_sepang/', sceneDir: './assets/sepang/', marshals: null, spaPits: false,
    optionalAssets: { barriers: true, pitlane: false, grassmask: true, crowd: true }, hasLods: false,
    pit: { limitFromS: 5260, limitToS: 360 }, gates: [1790, 3690],
    // Sepang (E : positions déduites de notre ligne centrale, s = 0 sur la ligne de départ ; 2 zones : ligne droite des stands, ligne droite arrière)
    drs: length => [[4290, 5040], [5250, length], [0, 520]],
  },
  silverstone: {
    id: 'silverstone', name: 'Silverstone', trackDir: './track_silverstone/', sceneDir: './assets/silverstone/', marshals: null, spaPits: false,
    optionalAssets: { barriers: false, pitlane: false, grassmask: false, crowd: false }, hasLods: false,
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1750, 4500],
    // Silverstone GP 2024 (E : secteurs et DRS estimés sur notre ligne centrale de 5 905,6 m, s = 0 au milieu de la voie des stands ; 2 zones : Wellington Straight, ligne droite des stands)
    drs: length => { const k = length / 5905.6; return [[5700 * k, length], [0, 200 * k], [1150 * k, 1700 * k]] },
  },
  marina: {
    id: 'marina', name: 'Marina Bay (nuit)', trackDir: './track_marina/', sceneDir: './assets/marina/', marshals: null, spaPits: false,
    optionalAssets: { barriers: false, pitlane: false, grassmask: true, crowd: false }, hasLods: false,
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1600, 3350],
    // Marina Bay Street Circuit, de nuit (E : secteurs et DRS estimés sur notre ligne centrale de 5 022,6 m, s = 0 sur la ligne de départ ; 3 zones, la première chevauche la ligne)
    drs: length => { const k = length / 5022.6; return [[4880 * k, length], [0, 255 * k], [2985 * k, 3400 * k], [945 * k, 1290 * k]] },
    skyDir: './assets/marina/sky/',
    night: { moon: 0.5, moonColor: 0xa9bfff, exp: 0.8, env: 0.65, hemi: 0.1, skyI: 0.4, fog: 0.0008, moonDisk: 0.35, glow: 1.0, glowSize: 1.6, lampI: 350, lampRange: 60 },
  },
}
const KEY = 'w11.circuit'
/** Sepang n'est proposé par le bouton de bascule que si la CI l'a assemblé (VITE_SEPANG=1) ; ?circuit=sepang reste toujours accepté. */
const SEPANG = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SEPANG === '1'
/** Silverstone n'est proposé par le bouton de bascule que si la CI a assemblé son paquet de données (VITE_SILVERSTONE=1) ; ?circuit=silverstone reste toujours accepté. */
const SILVERSTONE = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SILVERSTONE === '1'
/** Marina Bay (nuit) n'est proposé par le bouton de bascule que si la CI a assemblé ses données (VITE_MARINA=1) ; ?circuit=marina reste toujours accepté. */
const MARINA = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_MARINA === '1'
function pick(): Circuit['id'] {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('circuit') : null
    if (q === 'spa' || q === 'monza' || q === 'barcelona' || q === 'sepang' || q === 'silverstone' || q === 'marina') { localStorage.setItem(KEY, q); return q }
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (s === 'spa' || s === 'monza' || s === 'barcelona' || (s === 'sepang' && SEPANG) || (s === 'silverstone' && SILVERSTONE) || (s === 'marina' && MARINA)) return s
  } catch { /* stockage indisponible : Spa */ }
  return 'spa'
}
export const CIRCUIT: Circuit = CIRCUITS[pick()]
/** bascule Spa → Monza → Barcelone → Sepang → Silverstone → Marina Bay (ceux qui sont assemblés) puis recharge la page (surface et tuiles sont chargées au démarrage) */
export function switchCircuit() {
  const ids: Circuit['id'][] = ['spa', 'monza', 'barcelona']
  if (SEPANG) ids.push('sepang')
  if (SILVERSTONE) ids.push('silverstone')
  if (MARINA) ids.push('marina')
  const next = ids[(ids.indexOf(CIRCUIT.id) + 1) % ids.length]
  try { localStorage.setItem(KEY, next) } catch { /* ignoré */ }
  const u = new URL(location.href); u.searchParams.set('circuit', next); location.href = u.toString()
}
