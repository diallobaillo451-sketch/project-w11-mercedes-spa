/** Circuit actif. Choisi au démarrage (?circuit=spa|monza|barcelona, mémorisé dans le navigateur) : changer de circuit = recharger la page.
 *  Hors navigateur (tests Node) : Spa. */
export interface Circuit {
  id: 'spa' | 'monza' | 'barcelona'
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
    optionalAssets: { barriers: false, pitlane: false, grassmask: false, crowd: false }, hasLods: true,
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1619, 3403],
    // DRS approximés depuis les portions rectilignes de la trace GP 2023, pas un relevé officiel de lignes de détection.
    drs: length => { const k = length / 4668.6; return [[4437 * k, length], [0, 558 * k], [2982 * k, 3284 * k]] },
  },
}
const KEY = 'w11.circuit'
function pick(): Circuit['id'] {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('circuit') : null
    if (q === 'spa' || q === 'monza' || q === 'barcelona') { localStorage.setItem(KEY, q); return q }
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (s === 'spa' || s === 'monza' || s === 'barcelona') return s
  } catch { /* stockage indisponible : Spa */ }
  return 'spa'
}
export const CIRCUIT: Circuit = CIRCUITS[pick()]
/** bascule Spa → Monza → Barcelone puis recharge la page (surface et tuiles sont chargées au démarrage) */
export function switchCircuit() {
  const ids: Circuit['id'][] = ['spa', 'monza', 'barcelona']
  const next = ids[(ids.indexOf(CIRCUIT.id) + 1) % ids.length]
  try { localStorage.setItem(KEY, next) } catch { /* ignoré */ }
  const u = new URL(location.href); u.searchParams.set('circuit', next); location.href = u.toString()
}
