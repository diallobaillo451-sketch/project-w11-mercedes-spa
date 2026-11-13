// Direction de course : drapeaux, panneaux, VSC, safety car, drapeau rouge (écarts figés, départ arrêté),
// limites de piste, commissaires, trafic essais/qualif.
import { TrackSurface, type SurfaceMeta } from '../src/track/surface.ts'
import { RaceSim } from '../src/race/sim.ts'
import type { RacingLine } from '../src/track/racingLine.ts'
import { Pitlane } from '../src/track/pitlane.ts'
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
const slots = Array.from({ length: 20 }, (_, k) => sim.gridPos(k))
for (let k = 0; k < slots.length - 1; k++) {
  assert(Math.abs(sim.road(slots[k + 1].s, slots[k].s) - 16) < 0.01, `rangée ${k + 2} séparée de 16 m`)
  assert(slots[k].d !== slots[k + 1].d, `grille 1 x 1 alternée à la rangée ${k + 1}`)
}

// safety car
sim.ctrl.scDeploy('accident')
assert(sim.ctrl.sc.active && sim.ctrl.sc.lights && sim.ctrl.sc.mode === 'out', 'SC déployée, gyrophares, sortie')
sim.ctrl.sc.active = false

// Une SC déjà entrée dans les stands doit avancer jusqu'à la sortie, pas réinitialiser son progrès.
const shortPit = new Pitlane({ x: [0, 10, 20, 30, 40], z: [0, 0, 0, 0, 0], s: [19, 20, 21, 22, 23], d: [0, 12, 12, 12, 0], length: 40 })
const scSim = new RaceSim({ track: tr, line, pit: shortPit, kind: 'race', player: 'ham', seed: 5, laps: 3 })
scSim.ctrl.phase = 'racing'
Object.assign(scSim.ctrl.sc, { active: true, mode: 'in', s: scSim.pitEntryS - 0.5, v: 22, caught: true, inThisLap: true, pitP: 10 })
scSim.ctrl.update(0.1)
assert(scSim.ctrl.sc.pitP > 12, 'le progrès de la SC n’est pas remis à zéro après l’entrée')
for (let i = 0; i < 5 && scSim.ctrl.sc.active; i++) scSim.ctrl.update(0.1)
assert(!scSim.ctrl.sc.active && scSim.ctrl.sc.mode === 'park', 'la SC libère la piste après son passage aux stands')

// Une fenêtre stratégique sous SC peut être utilisée une fois, pas à chaque tour.
scSim.laps = 10
const strategyCar = scSim.cars.find(r => !r.player)!
strategyCar.laps = 3; strategyCar.plan = [{ lap: 4, c: 'M' }]; strategyCar.tyre.c = 'S'; strategyCar.wantPit = null
scSim.ctrl.sc.active = true; scSim.ctrl.sc.tEnd = 123
const lapPlan = (scSim as unknown as { lapPlan: (r: typeof strategyCar) => void }).lapPlan.bind(scSim)
lapPlan(strategyCar)
assert(strategyCar.wantPit === 'safety car', 'le stop prévu imminent est avancé sous SC')
scSim.enterPit(strategyCar)
strategyCar.mode = 'race'; strategyCar.wantPit = null
lapPlan(strategyCar)
assert(strategyCar.wantPit === null, 'le même stop n’est pas redemandé sous la même SC')
scSim.ctrl.sc.active = false

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

// Un accident simple avec dégagement ne justifie pas automatiquement un drapeau rouge.
const runoffCrash = sim.cars[5]
runoffCrash.idx = sim.idxOf(runoffCrash.s); runoffCrash.d = 25
sim.ctrl.incident(runoffCrash, runoffCrash.s, 'crash', 30)
assert(!sim.ctrl.red, 'un crash isolé avec dégagement reste sous jaune/SC/VSC')

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
sim.player.inPit = false
sim.ctrl.resumeAt = 0
sim.t = 80
sim.ctrl.update(1 / 60)
assert(sim.ctrl.red && sim.ctrl.phase === 'racing', 'pas de reprise tant que le joueur n’est pas rentré aux stands')
sim.player.inPit = true
sim.ctrl.update(1 / 60)
assert(!sim.ctrl.red && sim.ctrl.phase === 'lights' && sim.ctrl.placePlayerRequest, 'reprise : cinq feux, la voiture du joueur est ramenée en grille')

// Le classement n’est terminal qu’après arrivée ou abandon des vingt voitures.
const finishSim = new RaceSim({ track: tr, line, pit: null, kind: 'race', player: 'ham', seed: 11, laps: 3 })
finishSim.ctrl.phase = 'racing'; finishSim.classify()
const winner = finishSim.ordered()[0]
winner.laps = 3
finishSim.ctrl.lapDone(winner, 100, true)
assert(finishSim.chequered && winner.finished, 'le leader reçoit le damier à la fin de ses tours')
assert(finishSim.ctrl.phase !== 'done' && finishSim.cars.some(r => !r.finished && !r.out), 'les voitures encore en piste ne sont pas classées DNF au damier du leader')
for (const r of finishSim.cars) if (!r.finished && !r.out) finishSim.ctrl.lapDone(r, 100, true)
assert(finishSim.ctrl.phase === 'done' && finishSim.cars.every(r => r.finished || r.out), 'le classement terminal attend tous les arrivés/abandons')

// Un crash près d’une barrière sans dégagement est, lui, bloquant et peut justifier le rouge.
const blockedSim = new RaceSim({ track: tr, line, pit: null, kind: 'race', player: 'ham', seed: 12, laps: 3 })
blockedSim.ctrl.phase = 'racing'
const blocked = blockedSim.cars[1]; blocked.idx = blockedSim.idxOf(blocked.s)
blockedSim.track.WR[blocked.idx] = blockedSim.track.wr[blocked.idx] + 2
blockedSim.ctrl.incident(blocked, blocked.s, 'crash', 30)
assert(blockedSim.ctrl.red, 'épave proche du bord sans dégagement : drapeau rouge')

// Les crashs éloignés ne sont pas un carambolage; deux crashs dans le même secteur le sont.
const distantSim = new RaceSim({ track: tr, line, pit: null, kind: 'race', player: 'ham', seed: 13, laps: 3 })
distantSim.ctrl.phase = 'racing'
const distantA = distantSim.cars[1], distantB = distantSim.cars[2]
distantA.s = 20; distantB.s = 220; distantA.d = 25; distantB.d = 25
distantA.idx = distantSim.idxOf(distantA.s); distantB.idx = distantSim.idxOf(distantB.s)
distantSim.ctrl.incident(distantA, distantA.s, 'crash', 30)
distantSim.ctrl.incident(distantB, distantB.s, 'crash', 30)
assert(!distantSim.ctrl.red, 'deux crashs éloignés ne déclenchent pas un drapeau rouge')
const pileupSim = new RaceSim({ track: tr, line, pit: null, kind: 'race', player: 'ham', seed: 14, laps: 3 })
pileupSim.ctrl.phase = 'racing'
const pileupA = pileupSim.cars[1], pileupB = pileupSim.cars[2]
pileupA.s = 20; pileupB.s = 80; pileupA.d = 25; pileupB.d = 25
pileupA.idx = pileupSim.idxOf(pileupA.s); pileupB.idx = pileupSim.idxOf(pileupB.s)
pileupSim.ctrl.incident(pileupA, pileupA.s, 'crash', 30)
pileupSim.ctrl.incident(pileupB, pileupB.s, 'crash', 30)
assert(pileupSim.ctrl.red, 'plusieurs crashs dans le même secteur justifient le drapeau rouge')

// Un contact latéral modéré sans changement de trajectoire clairement fautif n’est pas pénalisé;
// une voiture qui se rabat nettement sur sa rivale reste responsable.
const contactSim = new RaceSim({ track: tr, line, pit: null, kind: 'race', player: 'ham', seed: 15, laps: 3 })
contactSim.ctrl.phase = 'racing'
const rear = contactSim.cars[1], front = contactSim.cars[2]
rear.d = -1; front.d = 1
;(rear as typeof rear & { _dr?: number })._dr = 1.0
;(front as typeof front & { _dr?: number })._dr = -0.5
contactSim.ctrl.collision(rear, front, 3.2, true)
assert(contactSim.ctrl.cases.length === 0, 'contact latéral léger : pas de responsable forcé')
;(rear as typeof rear & { _dr?: number })._dr = 2.0
;(front as typeof front & { _dr?: number })._dr = 0
contactSim.ctrl.collision(rear, front, 3.2, true)
assert(contactSim.ctrl.cases.length === 1 && contactSim.ctrl.cases[0].a === rear, 'rabattement net vers une voiture : responsable correctement identifié')
contactSim.ctrl.collision(front, rear, 3.2, true)
assert(contactSim.ctrl.cases.length === 1, 'même paire : une inversion de l’ordre longitudinal ne double pas l’enquête')

// Un chevauchement maintenu quelques images ne réapplique pas plusieurs fois les dégâts.
const damageSim = new RaceSim({ track: tr, line, pit: null, kind: 'race', player: 'ham', seed: 16, laps: 3 })
damageSim.ctrl.phase = 'racing'
const damageRear = damageSim.cars[1], damageFront = damageSim.cars[2]
const applyContactDamage = (damageSim as unknown as { contactDamage: (rear: typeof damageRear, front: typeof damageFront, dv: number, side: boolean) => void }).contactDamage.bind(damageSim)
applyContactDamage(damageRear, damageFront, 8, false)
const damageAfterFirstHit = damageRear.dmg.fw
damageSim.t += 0.1
applyContactDamage(damageRear, damageFront, 8, false)
assert(damageAfterFirstHit > 0 && damageRear.dmg.fw === damageAfterFirstHit, 'contact continu : dégâts appliqués une seule fois en moins de 0,5 s')

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
