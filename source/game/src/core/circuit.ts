/** Circuit actif. Choisi au démarrage (?circuit=spa|monza|sepang, mémorisé dans le navigateur) : changer de circuit = recharger la page.
 *  Hors navigateur (tests Node) : Spa. */
export interface Circuit {
  id: 'spa' | 'monza' | 'sepang'
  name: string
  /** surface, barrières, voie des stands, herbe, public */
  trackDir: string
  /** tuiles 3D (tiles.json, *.gltf, tex/) */
  sceneDir: string
  /** postes de commissaires (JSON), null : aucun */
  marshals: string | null
  /** stands 3D de Spa (garages, PNJ, feux de sortie, lampes de commissaires) : Spa seulement */
  spaPits: boolean
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
    pit: { limitFromS: 6790, limitToS: 200 }, gates: [2050, 5000],
    // Spa 2020 (E : positions estimées sur notre ligne centrale ; 2 zones : Kemmel, ligne droite des stands)
    drs: length => { const k = length / 7001.7; return [[1380 * k, 2230 * k], [6790 * k, length], [0, 190 * k]] },
  },
  monza: {
    id: 'monza', name: 'Monza', trackDir: './track_monza/', sceneDir: './assets/monza/', marshals: './track_monza/marshals.json', spaPits: false,
    pit: { limitFromS: 5405, limitToS: 70 }, gates: [1600, 3950],
    // FIA 2020 : zone 1 après Lesmo 2 jusqu'au freinage d'Ascari, zone 2 de la Parabolica à la Variante del Rettifilo (E)
    drs: length => [[2738, 3560], [5589, length], [0, 480]],
  },
  sepang: {
    id: 'sepang', name: 'Sepang', trackDir: './track_sepang/', sceneDir: './assets/sepang/', marshals: null, spaPits: false,
    pit: { limitFromS: 5260, limitToS: 360 }, gates: [1790, 3690],
    // Sepang (E : positions déduites de notre ligne centrale, s = 0 sur la ligne de départ ; 2 zones : ligne droite des stands, ligne droite arrière)
    drs: length => [[4290, 5040], [5250, length], [0, 520]],
  },
}
const KEY = 'w11.circuit'
/** Sepang n'est proposé par le bouton de bascule que si la CI l'a assemblé (VITE_SEPANG=1) ; ?circuit=sepang reste toujours accepté. */
const SEPANG = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SEPANG === '1'
const IDS: Circuit['id'][] = SEPANG ? ['spa', 'monza', 'sepang'] : ['spa', 'monza']
function pick(): Circuit['id'] {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('circuit') : null
    if (q === 'spa' || q === 'monza' || q === 'sepang') { localStorage.setItem(KEY, q); return q }
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (s === 'spa' || s === 'monza' || (s === 'sepang' && SEPANG)) return s
  } catch { /* stockage indisponible : Spa */ }
  return 'spa'
}
export const CIRCUIT: Circuit = CIRCUITS[pick()]
/** bascule Spa → Monza → Sepang → Spa puis recharge la page (surface et tuiles ne sont chargées qu'une fois, au démarrage) */
export function switchCircuit() {
  const next = IDS[(IDS.indexOf(CIRCUIT.id) + 1) % IDS.length] ?? 'spa'
  try { localStorage.setItem(KEY, next) } catch { /* ignoré */ }
  const u = new URL(location.href); u.searchParams.set('circuit', next); location.href = u.toString()
}
