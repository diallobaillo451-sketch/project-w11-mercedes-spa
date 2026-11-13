// Tests ciblés de conduite IA sur piste synthétique (aucun asset binaire ni rendu requis).
import { TrackSurface, type SurfaceMeta } from '../src/track/surface.ts'
import { Pitlane } from '../src/track/pitlane.ts'
import { RaceSim, type Racer } from '../src/race/sim.ts'
import { TYRE } from '../src/race/data.ts'

function assert(ok: boolean, msg: string) { if (!ok) throw new Error(msg) }

function makeTrack() {
  const N = 800, ND = 5, ds = 5
  const meta: SurfaceMeta = {
    N, ND, D0: -20, DSTEP: 10, ds, length: N * ds,
    cx: Array.from({ length: N }, () => 0), cy: Array.from({ length: N }, () => 0),
    cz: Array.from({ length: N }, (_, i) => -i * ds),
    wl: Array.from({ length: N }, () => 12), wr: Array.from({ length: N }, () => 12),
    wallL: Array.from({ length: N }, () => 18), wallR: Array.from({ length: N }, () => 18),
  }
  const grid = new Uint16Array(N * ND); grid.fill((4096 << 3) | 1)
  const track = new TrackSurface(meta, grid)
  const line = { x: new Float64Array(track.cx), z: new Float64Array(track.cz), e: new Float64Array(N), k: new Float64Array(N), v: new Float64Array(N).fill(55), N, ds }
  return { track, line }
}
const { track, line } = makeTrack()
function makePit() {
  const x = Array.from({ length: 41 }, () => 16), z = Array.from({ length: 41 }, (_, i) => -i * 4)
  const s = Array.from({ length: 41 }, (_, i) => i * 4), d = Array.from({ length: 41 }, () => 16)
  return new Pitlane({ x, z, s, d, length: 160 })
}
function makeSim(kind: 'race' | 'qualifying', opts: { pit?: Pitlane | null; laps?: number; seed?: number; sessionLen?: number } = {}) {
  return new RaceSim({ track, line, pit: opts.pit ?? null, kind, player: 'ham', seed: opts.seed ?? 9, laps: opts.laps ?? 10, sessionLen: opts.sessionLen ?? 480 })
}
const internal = (s: RaceSim) => s as unknown as {
  tactics: (r: Racer, ahead: Racer | null, gA: number, behind: Racer | null, gB: number, dt: number) => void
  runLogic: (r: Racer) => void
  lapPlan: (r: Racer) => void
  stepPit: (r: Racer, dt: number) => void
}

// Niveau maximal activé par défaut.
{
  const s = makeSim('race')
  assert(s.difficulty === 100, 'difficulté par défaut = 100 %')
}

// Une libération de box attend le passage d’une voiture qui arrive dans la voie rapide.
{
  const s = makeSim('race', { pit: makePit(), laps: 3 }), [r, o] = s.cars
  r.mode = o.mode = 'pit'; r.pitP = 100; r.pitT = -1; r.boxP = -1; r.v = 0; r.pitLat = 2.7
  o.pitP = 90; o.v = 20; o.pitT = -1; o.boxP = -1
  s.ctrl.release(r)
  const release = r as Racer & { _releaseUntil?: number }
  assert(release._releaseUntil !== undefined && s.ctrl.boxLight === 'red', 'box retenu lorsqu’une voiture arrive derrière')
  internal(s).stepPit(r, 1 / 60)
  assert(r.v === 0 && r.pitP === 100 && s.ctrl.cases.length === 0, 'la voiture reste au box sans collision ni pénalité')
  o.pitP = 130; s.t = 2
  internal(s).stepPit(r, 1 / 60)
  assert(release._releaseUntil === undefined && r.v > 0 && s.ctrl.boxLight === 'green', 'départ autorisé après le passage de la voiture')
}

// Un double jaune entraîne un vrai ralentissement, bloque le dépassement et coupe le DRS.
{
  const s = makeSim('race'), car = s.cars[0], other = s.cars[1]
  s.ctrl.phase = 'racing'; car.mode = other.mode = 'race'; car.d = other.d = 0
  car.s = 1000; car.idx = s.idxOf(car.s); other.s = 1005; other.idx = s.idxOf(other.s)
  car.laps = 3; s.t = 100
  s.ctrl.incident(car, car.s, 'spin')
  assert(s.ctrl.yellowAt(car.s) === 'double', 'incident sur piste = double jaune au poste')
  assert(!s.ctrl.mayOvertake(car, other), 'aucun dépassement sous double jaune, même si la voiture devant ralentit')
  assert(!s.ctrl.drsAllowed(car, 0), 'DRS désactivé dans la zone jaune')
  const cap = s.ctrl.speedCap(car, car.idx, 100)
  assert(cap <= car.prof.v[car.idx] * 0.51, 'double jaune : vitesse plafonnée à une réduction significative')
  const approach = Array.from({ length: track.N }, (_, i) => i * track.ds)
    .map(pos => s.ctrl.yellowAhead(pos, 500)).find(x => x && x.severity === 'double' && x.distance > 0 && x.distance < 100)
  assert(!!approach, 'la zone double jaune est détectable avant le poste')
}

// Une attaque n’est engagée que si une voie latérale entière est libre et dans les limites.
{
  const s = makeSim('race'), [attacker, ahead, leftBlock, rightBlock] = s.cars
  s.ctrl.phase = 'racing';
  for (const r of s.cars) { r.mode = 'garage'; r.off = null; r.attackT = 0 }
  attacker.mode = ahead.mode = 'race'; attacker.v = 48; ahead.v = 20; attacker.s = 1000; ahead.s = 1030
  attacker.d = ahead.d = 0; attacker.idx = s.idxOf(attacker.s); ahead.idx = s.idxOf(ahead.s)
  internal(s).tactics(attacker, ahead, 30, null, 1e9, 1 / 60)
  assert(attacker.attackT > 0 && attacker.off !== null, 'voie libre : attaque planifiée hors trajectoire')

  attacker.attackT = 0; attacker.off = null
  leftBlock.mode = rightBlock.mode = 'race'; leftBlock.s = rightBlock.s = attacker.s + 5
  leftBlock.d = -2.45; rightBlock.d = 2.45
  leftBlock.idx = rightBlock.idx = s.idxOf(leftBlock.s)
  internal(s).tactics(attacker, ahead, 30, null, 1e9, 1 / 60)
  assert(attacker.attackT === 0 && attacker.off === null, 'deux voies occupées : pas de plongeon ni de déplacement risqué')
}

// En qualification, le pilote lent cède systématiquement et ne gêne pas par distraction aléatoire.
{
  const s = makeSim('qualifying'), slow = s.cars[1], fast = s.cars[2]
  for (const r of s.cars) r.mode = 'garage'
  slow.mode = 'out'; fast.mode = 'push'; slow.s = 1000; fast.s = 960
  slow.v = 45; fast.v = 50; slow.d = fast.d = 0
  slow.idx = s.idxOf(slow.s); fast.idx = s.idxOf(fast.s)
  internal(s).tactics(slow, null, 1e9, fast, 40, 1 / 60)
  assert(slow.off !== null && slow.yieldT > 1, 'out lap : écart latéral immédiat pour laisser passer le tour lancé')
}

// Une fenêtre de départ de tour rapide occupée est reportée au lieu de transformer l'out lap en tour chronométré.
{
  const s = makeSim('qualifying'), ai = s.cars[1], blocker = s.cars[2]
  for (const r of s.cars) r.mode = 'garage'
  ai.mode = 'out'; ai.s = 3900; ai.v = 50; ai.tyre.temp = 0.95; ai.pushLeft = 1; ai.off = null
  ai.idx = s.idxOf(ai.s)
  internal(s).runLogic(ai)
  assert(ai.mode === 'push', 'piste libre : préparation du tour rapide')
  ai.mode = 'out'; (ai as Racer & { _prep?: boolean })._prep = false
  blocker.mode = 'out'; blocker.s = 3980; blocker.v = 50; blocker.d = 0; blocker.idx = s.idxOf(blocker.s)
  internal(s).runLogic(ai)
  assert(ai.mode === 'out', 'voiture sur la ligne prévue : le départ du tour rapide est différé')
  internal(s).lapPlan(ai)
  assert(ai.mode === 'out', 'l’IA ne démarre pas son tour lancé au franchissement si elle n’a pas trouvé de créneau')
}

// Un undercut ne doit pas avancer un arrêt prévu de deux tours, puis consommer trop tôt le composé du plan.
{
  const s = makeSim('race', { pit: makePit(), laps: 10 }), r = s.cars[1], rival = s.cars[2]
  r.mode = rival.mode = 'race'; r.s = 1000; rival.s = 980; r.v = 45; rival.v = 55
  r.idx = s.idxOf(r.s); rival.idx = s.idxOf(rival.s); r.tyre.c = 'S'; r.tyre.age = 2; r.tyre.used = ['S']
  r.laps = 2; r.plan = [{ lap: 4, c: 'M' }]; r.wantPit = null
  internal(s).lapPlan(r)
  assert(r.wantPit === null, 'l’undercut attend si l’arrêt planifié est à deux tours')
  r.laps = 1; r.wantPit = null
  internal(s).lapPlan(r)
  assert(r.wantPit === null, 'l’undercut attend aussi si l’arrêt planifié est à trois tours')
  r.laps = 0; r.wantPit = null
  internal(s).lapPlan(r)
  assert(r.wantPit === 'undercut', 'l’undercut reste permis quand il évite un arrêt prévu éloigné de quatre tours')
}

// La stratégie sèche est déterministe, respecte deux composés (règle 2020) et choisit les pneus pluie selon la météo.
{
  const s = makeSim('race', { pit: makePit(), laps: 20, seed: 17 })
  s.planRace()
  const first = s.cars.filter(r => !r.player).map(r => JSON.stringify([r.id, r.tyre.c, r.plan]))
  for (const r of s.cars.filter(x => !x.player)) {
    assert(r.plan.length >= 1, `${r.id} : arrêt planifié pour deux composés secs`)
    assert(new Set([r.tyre.c, ...r.plan.map(p => p.c)]).size >= 2, `${r.id} : deux composés distincts prévus`)
    assert(r.plan.every(p => p.lap > 0 && p.lap < s.laps), `${r.id} : relais positionnés avant l’arrivée`)
  }
  const short = makeSim('race', { pit: makePit(), laps: 10, seed: 7 })
  short.planRace()
  for (const r of short.cars.filter(x => !x.player)) {
    assert(r.plan.length === 1, `${r.id} : course de dix tours avec un arrêt calculé, sans sous-coupe anticipée`)
    const last = r.plan[0], remaining = short.laps - last.lap
    assert(remaining * short.wearScale <= TYRE[last.c].cliff + 4 + short.wearScale, `${r.id} : le dernier relais tient jusqu’à l’arrivée sans arrêt d’usure imprévu`)
  }
  s.planRace()
  assert(first.join('|') === s.cars.filter(r => !r.player).map(r => JSON.stringify([r.id, r.tyre.c, r.plan])).join('|'), 'même état et mêmes données = même stratégie')
  s.wetness = () => 0.5; s.planRace()
  assert(s.cars.filter(r => !r.player).every(r => r.tyre.c === 'I'), 'pluie intermédiaire : choix des pneus I')
  s.wetness = () => 0.9; s.planRace()
  assert(s.cars.filter(r => !r.player).every(r => r.tyre.c === 'W'), 'pluie forte : choix des pneus W')
}

console.log('OK : IA pilote (drapeaux, dépassements, qualification, stratégie, difficulté maximale)')
