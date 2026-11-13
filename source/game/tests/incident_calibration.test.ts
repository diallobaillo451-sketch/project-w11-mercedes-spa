// Calibration statistique du modèle : incidents simulés par voiture-tour, sans prétendre mesurer les statistiques FIA.
// Usage : npx tsx tests/incident_calibration.test.ts
import { INCIDENT_RATE_PER_LAP, SKILL } from '../src/race/data.ts'
import { incidentProbability, Rng } from '../src/race/sim.ts'

function assert(ok: boolean, message: string) { if (!ok) throw new Error(message) }

// Les poids des points critiques s’intègrent à 1 sur un tour complet. Ce test échantillonne
// les taux de base d’un plateau de 20 pilotes sur 52 tours, avant météo, trafic et cooldowns.
const rng = new Rng(20201108)
const counts = { crash: 0, spin: 0, lock: 0, wide: 0 }
const rates = INCIDENT_RATE_PER_LAP
for (const skill of Object.values(SKILL)) for (let lap = 0; lap < 52; lap++) {
  for (const kind of ['crash', 'spin', 'lock', 'wide'] as const) {
    if (rng.next() < incidentProbability(rates[kind], 1, 1, skill.cons, 100)) {
      counts[kind]++
      break
    }
  }
}
const total = counts.crash + counts.spin + counts.lock + counts.wide
assert(total >= 3 && total <= 16, `taux de base hors plage sur 1 040 voiture-tours : ${JSON.stringify(counts)}`)
assert(counts.crash <= 2 && counts.spin <= 4, `crashs/spins trop fréquents au niveau maximal : ${JSON.stringify(counts)}`)

const easiest = incidentProbability(rates.spin, 1, 1, 0.9, 40)
const hardest = incidentProbability(rates.spin, 1, 1, 0.9, 100)
assert(easiest > hardest && Math.abs(easiest / hardest - 1.12 / 0.55) < 1e-9, 'le réglage de difficulté module bien le risque de façon monotone')
assert(incidentProbability(1, 1e6, 1e6, 0, 100) === 0.05, 'la probabilité par pas reste plafonnée à 5 %')
assert(incidentProbability(NaN, 1, 1, 0.9, 100) === 0, 'les entrées non finies ne créent pas de risque')
console.log(`OK : calibration des incidents simulés (1 040 voiture-tours, difficulté max) — ${JSON.stringify(counts)}`)
