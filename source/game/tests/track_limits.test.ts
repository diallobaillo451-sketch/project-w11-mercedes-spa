// Les limites sont les lignes blanches du circuit, pas la limite extérieure de tout asphalte.
import { TrackSurface, type SurfaceMeta } from '../src/track/surface.ts'
import { allWheelsOutsideTrack, simulatedCarLegalEdges, simulatedCarOutsideTrack } from '../src/track/limits.ts'
import { readFileSync } from 'node:fs'
import { W11 } from '../src/physics/params.ts'

function assert(ok: boolean, msg: string) { if (!ok) throw new Error(msg) }
type BoundaryMeta = Pick<SurfaceMeta, 'N' | 'ds' | 'length' | 'wl' | 'wr' | 'wallL' | 'wallR'>

function boundarySurface(meta: BoundaryMeta): TrackSurface {
  // Mêmes bornes que TrackSurface : limites blanches, plafonnées par les murs.
  const left = Float32Array.from(meta.wl, (w, i) => Math.min(w, Math.max(1.2, meta.wallL[i] - 0.3)))
  const right = Float32Array.from(meta.wr, (w, i) => Math.min(w, Math.max(1.2, meta.wallR[i] - 0.3)))
  const edges = (i: number, _s: number): [number, number] => {
    const k = ((i % meta.N) + meta.N) % meta.N
    return [left[k], right[k]]
  }
  // La géométrie de limites n'a besoin que de la résolution et de edges().
  return { N: meta.N, ds: meta.ds, length: meta.length, edges } as unknown as TrackSurface
}

function idxAt(track: TrackSurface, s: number) { return ((Math.round(s / track.ds) % track.N) + track.N) % track.N }
function assertFootprintsInside(track: TrackSurface, s: number, d: number, label: string) {
  const wheels = [
    { along: W11.wheelbase / 2, lateral: -W11.halfTrackF, front: true },
    { along: W11.wheelbase / 2, lateral: W11.halfTrackF, front: true },
    { along: -W11.wheelbase / 2, lateral: -W11.halfTrackR, front: false },
    { along: -W11.wheelbase / 2, lateral: W11.halfTrackR, front: false },
  ]
  for (const w of wheels) {
    const at = s + w.along, i = idxAt(track, at), [left, right] = track.edges(i, at)
    const halfTyre = (w.front ? W11.tyreWidthF : W11.tyreWidthR) / 2
    const wheelD = d + w.lateral
    assert(wheelD - halfTyre >= -left - 1e-5 && wheelD + halfTyre <= right + 1e-5,
      `${label}: pneu ${w.front ? 'avant' : 'arrière'} hors ligne blanche à s=${s.toFixed(1)}, d=${d.toFixed(2)}`)
  }
}

function testCircuit(label: string, meta: BoundaryMeta) {
  assert(meta.N === meta.wl.length && meta.N === meta.wr.length && meta.N === meta.wallL.length && meta.N === meta.wallR.length,
    `${label}: dimensions des limites cohérentes`)
  const track = boundarySurface(meta)
  let minLower = Infinity, maxLower = -Infinity, minUpper = Infinity, maxUpper = -Infinity
  for (let i = 0; i < track.N; i++) {
    const s = i * track.ds
    const [legalMin, legalMax] = simulatedCarLegalEdges(track, s)
    assert(legalMin <= legalMax, `${label}: aucune position ne permet de garder les quatre pneus dans la ligne blanche à s=${s.toFixed(0)} (intervalle ${legalMin.toFixed(2)}–${legalMax.toFixed(2)})`)
    assertFootprintsInside(track, s, legalMin, label + ' borne intérieure minimale')
    assertFootprintsInside(track, s, legalMax, label + ' borne intérieure maximale')
    assert(!simulatedCarOutsideTrack(track, s, 0), `${label}: faux hors-piste au centre à s=${s.toFixed(0)}`)

    // Le seuil de sortie est spécifique à la largeur locale et à chaque empreinte.
    const wheels = [
      { along: W11.wheelbase / 2, lateral: -W11.halfTrackF, front: true },
      { along: W11.wheelbase / 2, lateral: W11.halfTrackF, front: true },
      { along: -W11.wheelbase / 2, lateral: -W11.halfTrackR, front: false },
      { along: -W11.wheelbase / 2, lateral: W11.halfTrackR, front: false },
    ]
    let allRightOutsideAt = -Infinity
    for (const w of wheels) {
      const at = s + w.along, iWheel = idxAt(track, at), [, right] = track.edges(iWheel, at)
      const halfTyre = (w.front ? W11.tyreWidthF : W11.tyreWidthR) / 2
      allRightOutsideAt = Math.max(allRightOutsideAt, right - w.lateral + halfTyre)
    }
    assert(simulatedCarOutsideTrack(track, s, allRightOutsideAt + 0.1),
      `${label}: quatre pneus au-delà de la ligne non détectés à s=${s.toFixed(0)}`)
    minLower = Math.min(minLower, legalMin); maxLower = Math.max(maxLower, legalMin)
    minUpper = Math.min(minUpper, legalMax); maxUpper = Math.max(maxUpper, legalMax)
  }
  assert(maxLower - minLower > 0.2 && maxUpper - minUpper > 0.2,
    `${label}: l'enveloppe doit s'adapter aux variations réelles de largeur`)
  console.log(`OK : ${label} — ${track.N} sections, bornes signées variables (${minLower.toFixed(2)}–${maxLower.toFixed(2)} m / ${minUpper.toFixed(2)}–${maxUpper.toFixed(2)} m)`)
  return track
}

const spaMeta = JSON.parse(readFileSync(new URL('../public/track/surface.json', import.meta.url), 'utf8')) as BoundaryMeta
const monzaMeta = JSON.parse(readFileSync(new URL('./fixtures/monza_limits.json', import.meta.url), 'utf8')) as BoundaryMeta
testCircuit('Spa-Francorchamps 2020', spaMeta)
testCircuit('Monza 2020 (largeurs réelles)', monzaMeta)

// Piste synthétique avec dégagement asphalté : quatre empreintes, pas le bitume, décident.
const N = 800, ds = 5
const uniformMeta: BoundaryMeta = {
  N, ds, length: N * ds,
  wl: Array.from({ length: N }, () => 5), wr: Array.from({ length: N }, () => 5),
  wallL: Array.from({ length: N }, () => 12), wallR: Array.from({ length: N }, () => 12),
}
const track = boundarySurface(uniformMeta)
const wheel = (front: boolean, d: number, type = 1) => ({ front, type, sample: { d, i: 0, s: 1000 } })
assert(!allWheelsOutsideTrack([wheel(true, 0), wheel(true, 0), wheel(false, 0), wheel(false, 0)], track), 'roues dans la piste : pas de sortie')
assert(!allWheelsOutsideTrack([wheel(true, 5.2), wheel(true, 5.25), wheel(false, 5.3), wheel(false, 4.9)], track), 'un pneu chevauche encore la ligne : pas de sortie complète')
assert(!allWheelsOutsideTrack([wheel(true, 5.2), wheel(true, 5.25), wheel(false, 5.3)], track), 'échantillons incomplets : décision prudente')
assert(allWheelsOutsideTrack([wheel(true, 5.2 + W11.tyreWidthF / 2), wheel(true, 5.25 + W11.tyreWidthF / 2), wheel(false, 5.3 + W11.tyreWidthR / 2), wheel(false, 5.35 + W11.tyreWidthR / 2)], track), 'quatre pneus entièrement hors ligne, même sur dégagement asphalté')
assert(!simulatedCarOutsideTrack(track, 1000, 0), 'empreinte IA centrée : sur la piste')
assert(!simulatedCarOutsideTrack(track, 1000, 4.4), 'au moins un pneu IA chevauche encore la ligne')
assert(!simulatedCarOutsideTrack(track, 1000, 5.68), 'sortie pas déclenchée tant que les pneus recouvrent la ligne')
assert(simulatedCarOutsideTrack(track, 1000, 6.2), 'les quatre pneus IA sont hors ligne malgré le bitume au-delà')
const [minOffset, maxOffset] = simulatedCarLegalEdges(track, 1000)
assert(minOffset > -4.1 && minOffset < -3.7 && maxOffset > 3.7 && maxOffset < 4.1,
  `intervalle signé IA sous la ligne blanche, tenant compte de la largeur des pneus (${minOffset.toFixed(2)}, ${maxOffset.toFixed(2)})`)
console.log('OK : limites de piste — lignes blanches, quatre pneus, bitume de dégagement et enveloppe IA')
