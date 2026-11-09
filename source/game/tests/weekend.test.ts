/** Lot 7 : réglages du garage (ailerons, hauteurs, pressions) et logique du week-end (programme, ingénieur). npx tsx tests/weekend.test.ts */
import { Vehicle } from '../src/physics/vehicle.ts'
import { FlatSurface } from '../src/track/surface.ts'
import { Weekend, defaultPlan, engineerProposals, newTelemetry, applyProposal, WK_ORDER } from '../src/core/weekend.ts'
const DT = 1 / 240
let fails = 0
const check = (n: string, ok: boolean, info = '') => { console.log((ok ? 'OK   ' : 'ÉCHEC ') + n + (info ? ' — ' + info : '')); if (!ok) fails++ }
const g = globalThis as unknown as { localStorage: Storage }
const mem = new Map<string, string>(); g.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v) }, removeItem: k => { mem.delete(k) } } as Storage
function vmax(wingR: number, wingF = 5) {
  const car = new Vehicle(new FlatSurface()); car.placeAt(0); car.setup.wingR = wingR; car.setup.wingF = wingF; car.setup.autoGear = true
  for (let i = 0; i < 240 * 45; i++) car.step(DT, { throttle: 1, brake: 0, steer: 0, drs: false })
  return car.forwardSpeed() * 3.6
}
const v3 = vmax(3), v5 = vmax(5), v8 = vmax(8)
check('aileron AR : moins d’aileron = plus de vitesse de pointe', v3 > v5 && v5 > v8 && v3 - v8 > 3 && v3 - v8 < 25, `AR 3 : ${v3.toFixed(1)} · 5 : ${v5.toFixed(1)} · 8 : ${v8.toFixed(1)} km/h`)
// pression : +2 psi → pneus plus froids (carcasse moins sollicitée), pression à chaud plus haute
function tyreRun(p: number) {
  const car = new Vehicle(new FlatSurface()); car.placeAt(0); car.setup.pressF = p; car.setup.pressR = p; car.fitTyres('C3', 100, 80)
  for (let i = 0; i < 240 * 20; i++) car.step(DT, { throttle: 0.75, brake: 0, steer: 0.12, drs: false })
  return { t: car.wheels.reduce((a, w) => a + w.tyre.temp, 0) / 4, p: car.wheels[0].tyre.pressure }
}
const p0 = tyreRun(0), p2 = tyreRun(2)
check('pressions : +2 psi → pression à chaud plus haute et pneus un peu plus froids', p2.p > p0.p + 1.5 && p2.t <= p0.t + 0.5, `0 psi : ${p0.p.toFixed(1)} psi ${p0.t.toFixed(1)} °C · +2 : ${p2.p.toFixed(1)} psi ${p2.t.toFixed(1)} °C`)
// hauteur de caisse : +6 mm → moins d'appui (garde au sol plus haute) mais pas d'effet aberrant
{ const a = new Vehicle(new FlatSurface()), b = new Vehicle(new FlatSurface()); a.placeAt(0); b.placeAt(0); b.setup.rideF = 6; b.setup.rideR = 6
  for (const c of [a, b]) for (let i = 0; i < 240 * 30; i++) c.step(DT, { throttle: 1, brake: 0, steer: 0, drs: false })
  const fz = (c: Vehicle) => c.wheels.reduce((s, w) => s + w.fz, 0)
  check('hauteur de caisse +6 mm : moins d’appui à haute vitesse', fz(b) < fz(a) && fz(b) > fz(a) * 0.8, `charge ${Math.round(fz(a))} → ${Math.round(fz(b))} N`) }
// week-end : programme, saut des EL1/EL2 (week-end court), sauvegarde
{ const p = defaultPlan('ver'); p.skip = ['FP1', 'FP2']; const w = Weekend.create(p)
  check('week-end court : commence en EL3', w.cur === 'FP3', w.cur)
  for (const id of ['FP3', 'Q1', 'Q2', 'Q3']) w.finish({ id: id as 'FP3', best: 104 - WK_ORDER.indexOf(id as 'FP3'), sectors: null, bestSectors: [30, 40, 30], laps: 3, valid: 2, vmax: 90, lapTimes: [], penalties: 0, pos: 1 })
  const l = Weekend.load()!
  check('sauvegarde / reprise : on est à la course, meilleur temps de qualif = Q3', l.cur === 'RACE' && l.qualiBest() === 104 - 5, `${l.cur} ${l.qualiBest()}`) }
// ingénieur : survireur + fond qui frotte + pneus chauds + blocages
{ const T = newTelemetry(), n = 5000; Object.assign(T, { n, tF: 112 * n, tR: 121 * n, vmax: 88, lockups: 4, scrapeT: 5, snapRear: 14, pushFront: 2 })
  const v = new Vehicle(new FlatSurface()), S = v.setup
  const pr = engineerProposals(T, S, 'Q1', 'dry', 30, 10), keys = pr.list.map(p => p.key)
  check('ingénieur : propositions cohérentes', keys.includes('wingR') && keys.includes('rideR') && keys.includes('pressR') && keys.includes('brakeBias') && keys.includes('fuel'), keys.join(','))
  let fuel = 0; for (const p of pr.list) applyProposal(S, p, kg => { fuel = kg })
  check('ingénieur : application au réglage', S.wingR === 6 && S.rideR === 2 && Math.abs(S.brakeBias - (v.setup.brakeBias)) < 1e-9 && S.compound === 'C4' && fuel === 8, `AR ${S.wingR} · H AR ${S.rideR} · BB ${(S.brakeBias * 100).toFixed(1)} · ${S.compound} · ${fuel} kg`)
  const none = engineerProposals(newTelemetry(), S, 'FP2', 'dry', 30, 10)
  check('ingénieur : sans données, pas de changement inventé', none.list.length === 0, none.text) }
console.log(fails ? `${fails} échec(s)` : 'tous les tests week-end passent')
process.exit(fails ? 1 : 0)
