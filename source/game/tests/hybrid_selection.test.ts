import { updateDetailedSelection } from '../src/race/hybrid.ts'
import type { RaceSim, Racer } from '../src/race/sim.ts'

function assert(ok: boolean, message: string) { if (!ok) throw new Error(message) }

function racer(i: number, s: number, mode = 'race', d = 0, out: string | null = null) {
  return { id: i === 0 ? 'player' : `r${i}`, code: `R${i}`, i, s, d, mode, out, player: i === 0, q: null, v: 0, fuel: 0, dmg: { fw: 0, rw: 0, floor: 0 } } as unknown as Racer
}

function fakeSim(cars: Racer[], length = 10000) {
  const player = cars[0]
  const sim = {
    player,
    cars,
    onTrack: (r: Racer) => Math.abs(r.d) < 8 && !r.out,
    road: (a: number, b: number) => {
      let gap = b - a
      gap -= Math.round(gap / length) * length
      return gap
    },
  }
  return sim as unknown as RaceSim
}

function assertIds(actual: Racer[], expected: number[], message: string) {
  assert(actual.map(r => r.i).join(',') === expected.join(','), `${message}: reçu [${actual.map(r => r.i).join(',')}], attendu [${expected.join(',')}]`)
}

// Même si une voiture derrière est plus proche, quatre voitures en piste devant ont priorité.
const player = racer(0, 9950)
const a1 = racer(1, 10), a2 = racer(2, 40), a3 = racer(3, 70), a4 = racer(4, 100), a5 = racer(5, 180)
const b1 = racer(6, 9945), b2 = racer(7, 9900)
const sim = fakeSim([player, a1, a2, a3, a4, a5, b1, b2])
const near = new Set([6, 7]) // les IDs précédents ne doivent pas figer la sélection.
assertIds(updateDetailedSelection(sim, near), [1, 2, 3, 4], 'priorité aux quatre voitures devant')
assert(near.size === 4 && [1, 2, 3, 4].every(id => near.has(id)), 'la sélection partagée reflète les quatre voitures actives')

// Les positions relatives évoluent : une nouvelle voiture devant entre, et l’ancienne est immédiatement retirée.
a1.s = 9948 // passe derrière le joueur
a5.s = 9970 // devient la voiture la plus proche devant (bouclage de ligne)
assertIds(updateDetailedSelection(sim, near), [5, 2, 3, 4], 'recalcul après changement des positions relatives')
assert(!near.has(1) && near.has(5), 'aucun adversaire dépassé ne reste retenu par une large hystérésis')

// S’il y a moins de quatre voitures devant, les places restantes sont prises par les plus proches derrière.
const p2 = racer(0, 1000)
const f1 = racer(1, 1010), f2 = racer(2, 1020)
const r1 = racer(3, 998), r2 = racer(4, 990), r3 = racer(5, 970)
const fallback = fakeSim([p2, f1, f2, r1, r2, r3])
assertIds(updateDetailedSelection(fallback, new Set()), [1, 2, 3, 4], 'complément par les voitures les plus proches derrière')

// Le signed gap tient compte du passage de la ligne de départ et exclut les voitures au stand/hors piste.
const p3 = racer(0, 9995)
const wrapAhead = racer(1, 5), wrapBehind = racer(2, 9988)
const pitCar = racer(3, 9998, 'pit'), offTrack = racer(4, 9999, 'race', 12)
assertIds(updateDetailedSelection(fakeSim([p3, wrapAhead, wrapBehind, pitCar, offTrack]), new Set()), [1, 2], 'distance signée autour de la ligne et filtre des voitures inéligibles')

console.log('OK : sélection hybride dynamique, quatre voitures devant prioritaires, replis et distances signées')
