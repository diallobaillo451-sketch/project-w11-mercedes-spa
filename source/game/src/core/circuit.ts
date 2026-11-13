/** Circuit actif. Choisi au démarrage (?circuit=spa|monza|yas, mémorisé dans le navigateur) : changer de circuit = recharger la page.
 *  Hors navigateur (tests Node) : Spa. */
export interface Circuit {
  id: 'spa' | 'monza' | 'yas'
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
  /** données propres au circuit, lues après pitlane.json et avant la création de la session (Spa et Monza : rien, valeurs ci-dessous) */
  ready: (pit: unknown) => Promise<void>
}
export const CIRCUITS: Record<Circuit['id'], Circuit> = {
  spa: {
    id: 'spa', name: 'Spa-Francorchamps', trackDir: './track/', sceneDir: './assets/spa/', marshals: './assets/spa_pits/marshals.json', spaPits: true,
    pit: { limitFromS: 6790, limitToS: 200 }, gates: [2050, 5000],
    // Spa 2020 (E : positions estimées sur notre ligne centrale ; 2 zones : Kemmel, ligne droite des stands)
    drs: length => { const k = length / 7001.7; return [[1380 * k, 2230 * k], [6790 * k, length], [0, 190 * k]] },
    ready: async () => {},
  },
  monza: {
    id: 'monza', name: 'Monza', trackDir: './track_monza/', sceneDir: './assets/monza/', marshals: './track_monza/marshals.json', spaPits: false,
    pit: { limitFromS: 5405, limitToS: 70 }, gates: [1600, 3950],
    // FIA 2020 : zone 1 après Lesmo 2 jusqu'au freinage d'Ascari, zone 2 de la Parabolica à la Variante del Rettifilo (E)
    drs: length => [[2738, 3560], [5589, length], [0, 480]],
    ready: async () => {},
  },
  yas: {
    id: 'yas', name: 'Yas Marina', trackDir: './track_yas/', sceneDir: './assets/yas/', marshals: './track_yas/marshals.json', spaPits: false,
    // valeurs de repli (E) : ready() les remplace par celles des données livrées avec le circuit (track_yas/meta.json et pitlane.json)
    pit: { limitFromS: 0, limitToS: 0 }, gates: [1760, 3520],
    drs: () => [],
    ready: pit => applyMeta(CIRCUITS.yas, pit),
  },
}
const IDS: Circuit['id'][] = ['spa', 'monza', 'yas']
const isId = (x: unknown): x is Circuit['id'] => IDS.indexOf(x as Circuit['id']) >= 0
const KEY = 'w11.circuit'
function pick(): Circuit['id'] {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('circuit') : null
    if (isId(q)) { localStorage.setItem(KEY, q); return q }
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (isId(s)) return s
  } catch { /* stockage indisponible : Spa */ }
  return 'spa'
}
export const CIRCUIT: Circuit = CIRCUITS[pick()]
/** Circuits dont les assets sont publiés : Spa et Monza toujours ; Yas Marina dès que track_yas/meta.json répond en JSON
 *  (sondé une fois au chargement, navigateur seulement) — le bouton Circuit n'envoie jamais sur un circuit pas encore livré. */
const available = new Set<Circuit['id']>(['spa', 'monza'])
if (typeof location !== 'undefined' && typeof fetch === 'function') {
  fetch(CIRCUITS.yas.trackDir + 'meta.json', { method: 'HEAD', cache: 'no-store' })
    .then(r => { if (r.ok && /json/i.test(r.headers.get('content-type') ?? '')) available.add('yas') })
    .catch(() => { /* hors ligne : Spa et Monza seulement */ })
}
/** passe au circuit suivant (Spa → Monza → Yas Marina s'il est publié) puis recharge la page (surface et tuiles ne sont chargées qu'une fois, au démarrage) */
export function switchCircuit() {
  const ids = IDS.filter(i => available.has(i) || i === CIRCUIT.id)
  const next = ids[(ids.indexOf(CIRCUIT.id) + 1) % ids.length] ?? 'spa'
  try { localStorage.setItem(KEY, next) } catch { /* ignoré */ }
  const u = new URL(location.href); u.searchParams.set('circuit', next); location.href = u.toString()
}
/** Circuits livrés par le pipeline Opi (Yas Marina) : secteurs et zones DRS lus dans track/meta.json (même schéma que Monza :
 *  sectors.S1_end_s / S2_end_s, drs.zones[].activateS / endS), zone 80 km/h lue dans pitlane.json (limitFromS / limitToS).
 *  Fichier absent ou valeur invalide : on garde les valeurs de repli de CIRCUITS. */
async function applyMeta(c: Circuit, pit: unknown): Promise<void> {
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  const p = pit as { limitFromS?: unknown; limitToS?: unknown } | null
  if (p && num(p.limitFromS) && num(p.limitToS)) c.pit = { limitFromS: p.limitFromS, limitToS: p.limitToS }
  try {
    const m = await fetch(c.trackDir + 'meta.json').then(r => (r.ok ? r.json() : null))
    const s = m?.sectors
    if (s && num(s.S1_end_s) && num(s.S2_end_s)) c.gates = [s.S1_end_s, s.S2_end_s]
    const z: unknown = m?.drs?.zones
    if (Array.isArray(z)) {
      const zones: [number, number][] = []
      for (const q of z) if (q && num(q.activateS) && num(q.endS)) zones.push([q.activateS, q.endS])
      c.drs = length => {
        const out: [number, number][] = []
        for (const [a, e] of zones) { if (e >= a) out.push([a, e]); else out.push([a, length], [0, e]) }
        return out
      }
    }
  } catch { /* meta.json absent ou illisible : valeurs de repli */ }
}
