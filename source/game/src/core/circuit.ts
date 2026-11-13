/** Circuit actif. Choisi au démarrage (?circuit=spa|monza|interlagos, mémorisé dans le navigateur) : changer de circuit = recharger la page.
 *  Hors navigateur (tests Node) : Spa. */
export interface Circuit {
  id: 'spa' | 'monza' | 'interlagos'
  name: string
  /** surface, barrières, voie des stands, herbe, public */
  trackDir: string
  /** tuiles 3D (tiles.json, *.gltf, tex/) */
  sceneDir: string
  /** postes de commissaires (JSON), null : aucun */
  marshals: string | null
  /** ressources physiques optionnelles ; null interdit un fetch implicite/fallback SPA */
  barriersFile: string | null
  pitlaneFile: string | null
  grassMaskFile: string | null
  crowdFile: string | null
  /** stands 3D de Spa (garages, PNJ, feux de sortie, lampes de commissaires) : Spa seulement */
  spaPits: boolean
  /** début et fin de la limitation à 80 km/h dans la voie des stands (s piste) */
  pit: { limitFromS: number; limitToS: number }
  /** longueur de référence des valeurs gates, en mètres */
  referenceLength: number
  /** fins des secteurs 1 et 2 (s piste), rapportées à referenceLength */
  gates: [number, number]
  /** zones DRS [début, fin] en s piste (une zone qui passe la ligne est coupée en deux) */
  drs: (length: number) => [number, number][]
}
export const CIRCUITS: Record<Circuit['id'], Circuit> = {
  spa: {
    id: 'spa', name: 'Spa-Francorchamps', trackDir: './track/', sceneDir: './assets/spa/', marshals: './assets/spa_pits/marshals.json', barriersFile: 'barriers.bin', pitlaneFile: 'pitlane.json', grassMaskFile: 'grassmask.bin', crowdFile: 'crowd.bin', spaPits: true,
    pit: { limitFromS: 6790, limitToS: 200 }, referenceLength: 7004, gates: [2050, 5000],
    // Spa 2020 (E : positions estimées sur notre ligne centrale ; 2 zones : Kemmel, ligne droite des stands)
    drs: length => { const k = length / 7001.7; return [[1380 * k, 2230 * k], [6790 * k, length], [0, 190 * k]] },
  },
  monza: {
    id: 'monza', name: 'Monza', trackDir: './track_monza/', sceneDir: './assets/monza/', marshals: './track_monza/marshals.json', barriersFile: 'barriers.bin', pitlaneFile: 'pitlane.json', grassMaskFile: 'grassmask.bin', crowdFile: 'crowd.bin', spaPits: false,
    pit: { limitFromS: 5405, limitToS: 70 }, referenceLength: 5793, gates: [1600, 3950],
    // FIA 2020 : zone 1 après Lesmo 2 jusqu'au freinage d'Ascari, zone 2 de la Parabolica à la Variante del Rettifilo (E)
    drs: length => [[2738 * length / 5793, 3560 * length / 5793], [5589 * length / 5793, length], [0, 480 * length / 5793]],
  },
  interlagos: {
    id: 'interlagos', name: 'Interlagos 2023', trackDir: './track_interlagos/', sceneDir: './assets/interlagos_2023/', marshals: null, barriersFile: null, pitlaneFile: null, grassMaskFile: 'grassmask.bin', crowdFile: null, spaPits: false,
    // Pas de voie des stands ni de barrières physiques validées dans le GLB source.
    pit: { limitFromS: 0, limitToS: 0 }, referenceLength: 4238.01, gates: [1321, 3096],
    // Estimations projetées sur le centreline : back straight et ligne droite de départ/arrivée (zone scindée à s=0).
    drs: length => { const k = length / 4238.01; return [[669 * k, 1266 * k], [3811 * k, length], [0, 188 * k]] },
  },
}
const KEY = 'w11.circuit'
function pick(): Circuit['id'] {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('circuit') : null
    if (q === 'spa' || q === 'monza' || q === 'interlagos') { localStorage.setItem(KEY, q); return q }
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (s === 'spa' || s === 'monza' || s === 'interlagos') return s
  } catch { /* stockage indisponible : Spa */ }
  return 'spa'
}
export const CIRCUIT: Circuit = CIRCUITS[pick()]
/** bascule Spa → Monza → Interlagos puis recharge la page (surface et tuiles chargées au démarrage) */
export function switchCircuit() {
  const ids: Circuit['id'][] = ['spa', 'monza', 'interlagos']
  const next = ids[(ids.indexOf(CIRCUIT.id) + 1) % ids.length]
  try { localStorage.setItem(KEY, next) } catch { /* ignoré */ }
  const u = new URL(location.href); u.searchParams.set('circuit', next); location.href = u.toString()
}
