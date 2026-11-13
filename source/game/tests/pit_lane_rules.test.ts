// Voie des stands complète : lignes, 80 km/h, voie rapide / voie de travail, arrêt au box,
// feu de sortie (fermé au drapeau rouge), ligne de sortie, retour en piste.
// Les ancres absentes laissent le pitlane.json tel quel (iEntry = 0, iExit = dernier point).
import { TrackSurface, type SurfaceMeta } from '../src/track/surface.ts'
import { Pitlane } from '../src/track/pitlane.ts'
import { RaceSim } from '../src/race/sim.ts'
import { Game } from '../src/core/game.ts'
import type { RacingLine } from '../src/track/racingLine.ts'
import { PIT_LIMIT } from '../src/race/sim.ts'

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
  return { x: new Float64Array(t.cx), z: new Float64Array(t.cz), e: new Float64Array(N), k: new Float64Array(N), v: new Float64Array(N).fill(50), N, ds: t.ds }
}

// —— ancres et repli
{
  const x = Array.from({ length: 21 }, (_, i) => i * 10)
  const z = x.map(() => 0)
  const p = new Pitlane({ x, z, s: x, d: x.map(() => 15), length: 200 })
  assert(p.iEntry === 0 && p.iExit === p.n - 1, 'repli : entrée au début, sortie à la fin')
  assert(!p.anchored, 'repli : pas marqué comme ancré')
  p.applyAnchors({
    pit_entry: { x: 20, z: 0 },
    pit_speed_start: { x: 40, z: 0 },
    pit_speed_end: { x: 120, z: 0 },
    pit_exit: { x: 180, z: 0 },
    pit_exit_light: { x: 176, z: 2 },
  })
  assert(p.anchored, 'ancres prises')
  assert(p.x[p.iEntry] === 20 && p.x[p.iIn] === 40 && p.x[p.iOut] === 120 && p.x[p.iExit] === 180, 'lignes calées sur les ancres')
  assert(p.light.x === 176 && p.light.z === 2, 'feu de sortie à son ancre')
  assert(p.inSpeedZone(80, 0.2) && !p.inSpeedZone(15, 0.2) && !p.inSpeedZone(190, 0.2), '80 km/h seulement entre les deux lignes')
  assert(p.inSpeedZone(80, 0.2, 1, 0), 'voie limitée dans le sens de la spline')
  assert(!p.inSpeedZone(80, 0.2, 0, 1), 'pas de limiteur quand la voiture fait face à l’autre sens')
  assert(!p.inSpeedZone(80, 5.5), 'la proximité à 5,5 m ne suffit pas à activer le limiteur')
  assert(p.probe(80, 0.3).lane === 'fast', 'voie rapide sur le chemin')
  assert(p.probe(80, 3).lane === 'work', 'voie de travail vers les garages')
  assert(p.probe(80, 30).lane === 'off', 'hors de la voie')
  const n0 = p.n
  p.applyAnchors({
    pitlane_path: { x: [0, 0, 0, 0, 0, 0], z: [0, 10, 20, 30, 40, 50] },
    pit_speed_start: { x: 0, z: 12 },
    pit_speed_end: { x: 0, z: 38 },
    pit_exit: { x: 0, z: 50 },
  })
  assert(p.n > n0 && Math.abs(p.cum[p.n - 1] - 50) < 1.5, 'spline rééchantillonnée, longueur conservée')
  assert(p.cum[p.iIn] < p.cum[p.iOut] && p.cum[p.iOut] < p.cum[p.iExit], 'ordre des lignes sur la spline')
}

// —— entrée joueur : une trajectoire parallèle ne déclenche ni radio, ni limiteur, ni pénalité
{
  const makePit = (x: number) => {
    const xs: number[] = [], zs: number[] = [], ss: number[] = [], ds: number[] = []
    for (let i = 0; i <= 40; i++) { xs.push(x); zs.push(-i * 2); ss.push(i * 2); ds.push(15) }
    const p = new Pitlane({ x: xs, z: zs, s: ss, d: ds, length: 80 })
    p.iEntry = 3; p.iIn = 6; p.iOut = 34; p.iExit = 40
    return p
  }
  const driveTo = (g: Game, x: number, z: number, hz = -1) => {
    g.car.placeAtXZ(x, z, 0, hz, 12); g.car.pos[0] = x; g.car.pos[2] = z
    ;(g as unknown as { updatePit(dt: number): void }).updatePit(1 / 60)
  }
  const parallel = new Game(straight(), 'practice'); parallel.pit = makePit(4)
  driveTo(parallel, 0, -4); driveTo(parallel, 0, -8); driveTo(parallel, 0, -14)
  assert(!parallel.events.pitEntry && !parallel.pitCommit, 'frôler la spline à 4 m ne compte pas comme une entrée')
  assert(!parallel.inPit && !parallel.events.pitSpeeding && parallel.penalties === 0, 'pas de limiteur ni de pénalité sur la trajectoire parallèle')

  const reverse = new Game(straight(), 'practice'); reverse.pit = makePit(4)
  driveTo(reverse, 4, -4, 1); driveTo(reverse, 4, -8, 1); driveTo(reverse, 4, -14, 1)
  assert(!reverse.events.pitEntry && !reverse.pitCommit && !reverse.inPit, 'rouler à contresens près des stands ne déclenche pas l’entrée')

  const real = new Game(straight(), 'practice'); real.pit = makePit(4)
  driveTo(real, 4, -4); driveTo(real, 4, -8)
  assert(real.events.pitEntry && real.pitCommit, 'le franchissement orienté de la ligne déclenche une seule entrée')
  driveTo(real, 4, -14)
  assert(real.inPit, 'le limiteur devient actif après la vraie ligne de début de limitation')
}

// —— IA : limiteur, arrêt au box, feu rouge, ligne de sortie, blend
{
  const tr = straight()
  const xs: number[] = [], zs: number[] = [], ss: number[] = [], ds: number[] = []
  for (let i = 0; i <= 40; i++) { xs.push(16); zs.push(-i * 4); ss.push(i * 4); ds.push(16) }
  const pit = new Pitlane({ x: xs, z: zs, s: ss, d: ds, length: 160 })
  const sim = new RaceSim({ track: tr, line: lineOf(tr), pit, kind: 'practice', player: 'ham', seed: 3, sessionLen: 1, laps: 2 })
  const ai = sim.cars.find(r => !r.player && r.team === 'ferrari')!
  for (const r of sim.cars) if (r !== ai) { r.out = 'test'; r.mode = 'garage' }
  sim.enterPit(ai)
  assert(ai.pitLat === 0, 'entrée en voie rapide')
  let vmax = 0, stopped = false
  for (let k = 0; k < 60 * 25 && !stopped; k++) {
    sim.step(1 / 60)
    if (ai.mode === 'pit' && ai.pitP >= pit.cum[pit.iIn] && ai.pitP <= pit.cum[pit.iOut]) vmax = Math.max(vmax, ai.v)
    if (ai.v === 0 && Math.abs(ai.pitP - sim.boxOf(ai.team)) < 0.5 && (ai.pitPhase === 'jack' || ai.pitPhase === 'guns' || ai.pitPhase === 'off' || ai.pitPhase === 'on')) stopped = true
  }
  assert(stopped, 'arrêt exactement au box (' + ai.pitPhase + ' p=' + ai.pitP.toFixed(2) + ' box=' + sim.boxOf(ai.team).toFixed(2) + ')')
  assert(ai.pitLat === 2.7, 'voie de travail au box')
  assert(vmax <= PIT_LIMIT + 0.15, 'limiteur 80 km/h (' + (vmax * 3.6).toFixed(1) + ')')
  const other = sim.cars.find(r => r !== ai && !r.player)!
  other.out = null
  sim.leaveGarage(other)
  assert(other.pitLat === 2.7 && other.boxP < 0, 'départ du garage en voie de travail, sans arrêt')
  sim.ctrl.red = true
  assert(sim.ctrl.pitExitGreen() === false, 'feu de sortie rouge sous drapeau rouge')
  ai.mode = 'pit'; ai.boxP = -1; ai.pitT = -1; ai.v = 30; ai.pitP = sim.pitLen - 0.02; ai.out = null
  const nCase = sim.ctrl.cases.length
  sim.step(1 / 60)
  assert(sim.ctrl.cases.length > nCase && sim.ctrl.cases.some(c => c.a === ai && c.what.includes('sortie')), 'franchir la ligne au feu rouge est pénalisé')
  assert(ai.mode !== 'pit', 'après la ligne, la voiture rejoint la piste')
  assert(Math.abs(ai.d - pit.d[pit.n - 1]) < 0.2, 'blend sur le point de sortie du chemin')
}

console.log('OK : voie des stands (ancres, 80 km/h, voies, box, feu, sortie)')
