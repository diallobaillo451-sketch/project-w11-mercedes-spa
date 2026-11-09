// Lot 8 C — course / qualif simulées sans rendu (19 IA + « joueur » piloté par l'IA) : rythme, incidents, règles.
// usage : npx tsx tests/race_sim.test.ts [race|quali] [tours] [graine]
import { readFileSync, writeFileSync } from 'node:fs'
import { TrackSurface } from '../src/track/surface.ts'
import { buildRacingLine } from '../src/track/racingLine.ts'
import { Pitlane } from '../src/track/pitlane.ts'
import { RaceSim } from '../src/race/sim.ts'
import { fmtT } from '../src/race/control.ts'
const meta = JSON.parse(readFileSync(new URL('../public/track/surface.json', import.meta.url), 'utf8'))
const buf = readFileSync(new URL('../public/track/surface.bin', import.meta.url))
const track = new TrackSurface(meta, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2))
const pit = new Pitlane(JSON.parse(readFileSync(new URL('../public/track/pitlane.json', import.meta.url), 'utf8')), { limitFromS: 6790, limitToS: 200 })
const kind = (process.argv[2] ?? 'race') === 'race' ? 'race' : 'qualifying'
const laps = Number(process.argv[3] ?? 10), seed = Number(process.argv[4] ?? 7)
const t0 = Date.now()
const line = buildRacingLine(track, 1600, 1.0)
const sim = new RaceSim({ track, line, pit, kind, laps, player: 'ham', seed, sessionLen: 720, playerAi: true })
console.log('profils', Date.now() - t0, 'ms ; T équipe', [...sim.profs].map(([k, v]) => k + ' ' + fmtT(v.T) + ' mu ' + v.mu.toFixed(3)).join(' | '))
const log: string[] = []
sim.onMsg = m => { const l = `${fmtT(m.t).padStart(9)} [${m.kind}] ${m.text}`; log.push(l); if (!process.env.QUIET) console.log(l) }
const t1 = Date.now()
if (kind === 'race') { sim.planRace(); sim.ctrl.startFormation() }
let T = 0
const endT = Number(process.env.ENDT ?? (kind === "race" ? 3600 : 1120))
while (T < endT) {
  sim.update(1 / 30); T += 1 / 30
  if (process.env.PH && Math.floor(T) % 60 === 0 && Math.floor(T - 1 / 30) % 60 !== 0) console.log('t', T.toFixed(0), sim.ctrl.phase, 'lead', sim.leader().id, sim.leader().laps, sim.leader().dist.toFixed(0))
  if (kind !== 'race' && T > 720 && !sim.chequered) { sim.chequered = true }
  if (kind === 'race' && sim.ctrl.phase === 'done') break
  if (kind !== 'race' && T > 720 && sim.cars.every(r => r.mode === 'garage' || r.mode === 'dnf')) break
}
console.log('simulé', T.toFixed(0), 's en', Date.now() - t1, 'ms')
const rows = sim.ordered().map(r => ({ pos: r.pos, id: r.id, laps: r.laps, best: +r.best.toFixed(3), last: +r.last.toFixed(3), gap: +r.gap.toFixed(3), stops: r.stops, tyres: r.tyre.used.join('>'), pen: r.pen + r.penServed, out: r.out, laptimes: r.lapTimes.map(x => +x.toFixed(2)) }))
for (const r of rows) console.log(String(r.pos).padStart(2), r.id, 'tours', r.laps, 'best', fmtT(r.best), 'écart', r.gap, 'arrêts', r.stops, r.tyres, r.pen ? 'pén ' + r.pen : '', r.out ?? '', kind === 'race' ? r.laptimes.join(' ') : '')
writeFileSync(new URL(`../../reports/race_sim_${kind}_${seed}.json`, import.meta.url), JSON.stringify({ kind, laps, seed, rows, log }, null, 1))
if (process.env.DBG) { const r = sim.cars.find(c => c.id === process.env.DBG)!; console.log(r.id, r.lapTimes.map(fmtT), 'kq', r.kq.toFixed(4), 'T', fmtT(r.prof.T)) }
if (process.env.DUMP) for (const r of sim.cars) console.log(r.id, r.mode, 's', r.s.toFixed(1), 'd', r.d.toFixed(2), 'v', r.v.toFixed(1), 'off', r.off?.toFixed(2), 'err', r.err?.kind, r.wantPit, 'att', r.attackT.toFixed(1), 'pitP', r.pitP.toFixed(0), r.out)
