// Direction de course : drapeaux, panneaux, VSC, safety car, drapeau rouge (écarts figés, départ arrêté),
// limites de piste, commissaires, trafic essais/qualif.
import { TrackSurface, type SurfaceMeta } from '../src/track/surface.ts'
import { RaceSim } from '../src/race/sim.ts'
import type { RacingLine } from '../src/track/racingLine.ts'
import { PIT_CREW } from '../src/race/data.ts'

function assert(ok: boolean, msg: string) { if (!ok) throw new Error(msg) }

function straight(): TrackSurface {
  const N = 80, ND = 5, ds = 5
  const meta: SurfaceMeta = {
    N, ND, D0: -20, DSTEP: 10, ds, length: N * ds,
    cx: Array.from({ length: N }, () => 0),
    cy: Array.from({ length: N }, () => 0),
    cz: Array.from({ length: N }, (_, i) => -i * ds),
    wl: Array.from({ length: N }, () => 12),
    wr: Array.from({ length: N }, () => 12),
    wallL: Array.from({ length: N }, () => 18),
    wallR: Array.from({ length: N }, () => 18),
  }
  const grid = new Uint16Array(N * ND)
  for (let k = 0; k < grid.length; k++) grid[k] = (4096 << 3) | 1
  return new TrackSurface(meta, grid)
}
function lineOf(t: TrackSurface): RacingLine {
  const N = t.N
  return { x: new Float64Array(t.cx), z: new Float64Array(t.cz), e: new Float64Array(N), k: new Float64Array(N), v: new Float64Array(N).fill(55), N, ds: t.ds }
}

const tr = straight(), line = lineOf(tr)
const sim = new RaceSim({ track: tr, line, pit: null, kind: 'race', player: 'ham', seed: 4, laps: 3 })
sim.ctrl.phase = 'racing'
for (const r of sim.cars) { if (!r.player) { r.mode = 'race'; r.v = 40 } }
sim.cars.forEach((r, i) => { r.dist = 2000 - i * 30; r.gap = i * 0.35 })
sim.classify()

// safety car
sim.ctrl.scDeploy('accident')
assert(sim.ctrl.sc.active && sim.ctrl.sc.lights && sim.ctrl.sc.mode === 'out', 'SC déployée, gyrophares, sortie')
sim.ctrl.sc.active = false

// VSC : delta pour une IA
sim.ctrl.vscDeploy('voiture arrêtée')
assert(sim.ctrl.vsc, 'VSC déployée')
const fast = sim.cars.find(r => !r.player)!
for (let i = 0; i < 200; i++) sim.ctrl.vscOver(fast, 70, 20, 1 / 60)
assert(sim.ctrl.cases.some(c => c.a === fast && c.what.includes('VSC')), 'delta VSC pénalise une IA')
sim.ctrl.vsc = false

// drapeau jaune au poste
sim.ctrl.incident(fast, 40, 'spin')
sim.ctrl.update(1 / 60)
const flags = sim.ctrl.marshalState()
assert(flags.length > 4, 'postes de commissaires')
assert(flags.some(p => p.panel === 'double' || p.panel === 'yellow'), 'panneau jaune sur l’incident')
assert(flags.some(p => p.flag === 'green'), 'vert au poste suivant')

// limites de piste → enquête → 5 s
const lim = sim.cars[3]
for (let i = 0; i < 4; i++) sim.ctrl.trackLimits(lim)
assert(sim.ctrl.cases.some(c => c.a === lim && c.what.includes('limites')), '4e sortie de piste : affaire ouverte')
sim.t += 40
sim.ctrl.update(1 / 60)
assert(lim.pen >= 5, 'les commissaires ont tranché : 5 s (' + lim.pen + ')')

// drapeau rouge : écarts figés, puis départ arrêté
sim.classify()
const order = sim.ordered().map(r => r.id)
const gap0 = sim.player.gap
sim.ctrl.redFlag('barrière')
assert(sim.ctrl.frozenOrder !== null && sim.ctrl.pitExitGreen() === false, 'drapeau rouge : sortie des stands fermée, ordre figé')
for (const r of sim.cars) r.dist += 800
sim.classify()
assert(sim.ordered().map(r => r.id).join() === order.join(), 'le classement ne bouge plus sous drapeau rouge')
assert(sim.player.gap === gap0, 'les écarts restent ceux du drapeau')
for (const r of sim.cars) if (!r.player && !r.out) r.mode = 'redq'
sim.player.inPit = true
sim.ctrl.resumeAt = 0
sim.step(1 / 60)
assert(!sim.ctrl.red && sim.ctrl.phase === 'lights' && sim.ctrl.placePlayerRequest, 'reprise : cinq feux, la voiture du joueur est ramenée en grille')

// essais et qualif : les IA ont un plan et sortent du garage
for (const kind of ['practice', 'qualifying'] as const) {
  const q = new RaceSim({ track: tr, line, pit: null, kind, player: 'ham', seed: 9, sessionLen: 600, laps: 2 })
  const ai = q.cars.filter(r => !r.player)
  assert(ai.every(r => r.runs.length >= 1 && r.mode === 'garage'), kind + ' : trafic prévu au garage')
  for (const r of ai) r.runs[0] = 0
  q.step(1 / 60)
  assert(ai.some(r => r.mode === 'pit' || r.mode === 'out' || r.mode === 'push'), kind + ' : une voiture est sortie')
}

assert(PIT_CREW.mercedes >= 2.2 && PIT_CREW.mercedes <= 3 && PIT_CREW.haas <= 3, 'arrêts entre 2 et 3 s')
console.log('OK : direction de course (drapeaux, SC, VSC, rouge, commissaires, trafic)')
