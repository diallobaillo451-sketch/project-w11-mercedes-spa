/** Circuit actif. Choisi au démarrage (?circuit=spa|monza|yas, mémorisé dans le navigateur) : changer de circuit = recharger la page.
 *  Hors navigateur (tests Node) : Spa. Les données physiques Yas sont des estimations issues du modèle fourni et du plan FIA 2021. */
export type CircuitId = 'spa' | 'monza' | 'yas'
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
  /** début et fin de la limitation à 80 km/h dans la voie des stands (s piste) */
  pit: { limitFromS: number; limitToS: number }
  /** fins des secteurs 1 et 2 (s piste) */
  gates: [number, number]
  /** zones DRS [début, fin] en s piste (une zone qui passe la ligne est coupée en deux) */
  drs: (length: number) => [number, number][]
  /** éclairage et ciel de nuit */
  night?: boolean
}
const YAS_RUNTIME_LENGTH = 5329.51861987993
const YAS_DRS = [[1647.87, 2526.57], [2905.61, 3684.24]] as const
export const CIRCUITS: Record<CircuitId, Circuit> = {
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
  yas: {
    id: 'yas', name: 'Yas Marina 2021 · nuit', trackDir: './track_yas/', sceneDir: './assets/yas_marina/', marshals: null, spaPits: false,
    pit: { limitFromS: 5083.83, limitToS: 400.16 }, gates: [1248.11, 3734.23], night: true,
    // Offsets FIA 2021 appliqués aux virages projetés sur le centerline estimé; valeurs absolues non officielles.
    drs: length => { const k = length / YAS_RUNTIME_LENGTH; return YAS_DRS.map(([a, b]) => [a * k, b * k]) },
  },
}
const KEY = 'w11.circuit'
function pick(): CircuitId {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('circuit') : null
    if (q === 'spa' || q === 'monza' || q === 'yas') { localStorage.setItem(KEY, q); return q }
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (s === 'spa' || s === 'monza' || s === 'yas') return s
  } catch { /* stockage indisponible : Spa */ }
  return 'spa'
}
export const CIRCUIT: Circuit = CIRCUITS[pick()]
/** Associe l’identifiant calendrier 2020 au layout runtime livré. */
export function runtimeCircuitForCalendar(id: string): CircuitId {
  if (id === 'abu') return 'yas'
  if (id === 'ita') return 'monza'
  return 'spa'
}
/** Bascule sur le circuit demandé (ou cycle Spa ⇄ Yas) puis recharge la page. */
export function switchCircuit(target?: CircuitId, resume?: string) {
  const ids: CircuitId[] = ['spa', 'yas']
  const next = target ?? ids[(ids.indexOf(CIRCUIT.id) + 1) % ids.length]
  try { localStorage.setItem(KEY, next) } catch { /* ignoré */ }
  const u = new URL(location.href); u.searchParams.set('circuit', next)
  if (resume) u.searchParams.set('resume', resume); else u.searchParams.delete('resume')
  location.href = u.toString()
}
