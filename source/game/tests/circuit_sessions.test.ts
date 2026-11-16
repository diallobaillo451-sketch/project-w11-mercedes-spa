// Sessions du week-end (qualif, course) simulées sans rendu sur un circuit assemblé : vérifie que la voie des stands et les IA tiennent.
// usage : TRACK_DIR=../../../public/track_silverstone/ PIT_FROM=5678 PIT_TO=320 LAP_MIN=75 LAP_MAX=135 node tests/circuit_sessions.test.ts [race|quali] [tours] [graine]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { TrackSurface } from '../src/track/surface.ts'
import { buildRacingLine } from '../src/track/racingLine.ts'
import { Pitlane } from '../src/track/pitlane.ts'
import { RaceSim } from '../src/race/sim.ts'
import { fmtT } from '../src/race/control.ts'
const base = new URL((process.env.TRACK_DIR ?? '../public/track/').replace(/\/?$/, '/'), import.meta.url)
const meta = JSON.parse(readFileSync(new URL('surface.json', base), 'utf8'))
const buf = readFileSync(new URL('surface.bin', base))
const track = new TrackSurface(meta, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2))
const pit = new Pitlane(JSON.parse(readFileSync(new URL('pitlane.json', base), 'utf8')), { limitFromS: Number(process.env.PIT_FROM ?? 6790), limitToS: Number(process.env.PIT_TO ?? 200) })
const kind = (process.argv[2] ?? 'race') === 'race' ? 'race' : 'qualifying'
const laps = Number(process.argv[3] ?? 3), seed = Number(process.argv[4] ?? 7)
const lapMin = Number(process.env.LAP_MIN ?? 60), lapMax = Number(process.env.LAP_MAX ?? 200)
const line = buildRacingLine(track, 1600, 1.0)
const sim = new RaceSim({ track, line, pit, kind, laps, player: 'ham', seed, sessionLen: 720, playerAi: true })
const log: string[] = []
sim.onMsg = m => { log.push(`${fmtT(m.t).padStart(9)} [${m.kind}] ${m.text}`) }
if (kind === 'race') { sim.planRace(); sim.ctrl.startFormation() }
let T = 0
const endT = Number(process.env.ENDT ?? (kind === 'race' ? 3600 : 1120))
while (T < endT) {
  sim.update(1 / 30); T += 1 / 30
  if (kind !== 'race' && T > 720 && !sim.chequered) { sim.chequered = true }
  if (kind === 'race' && sim.ctrl.phase === 'done') break
  if (kind !== 'race' && T > 720 && sim.cars.every(r => r.mode === 'garage' || r.mode === 'dnf')) break
}
const rows = sim.ordered().map(r => ({ pos: r.pos, id: r.id, laps: r.laps, best: +r.best.toFixed(3), stops: r.stops, out: r.out, laptimes: r.lapTimes.map(x => +x.toFixed(2)) }))
console.log(kind, 'simulé', T.toFixed(0), 's, phase', sim.ctrl.phase)
for (const r of rows) console.log(String(r.pos).padStart(2), r.id, 'tours', r.laps, 'meilleur', fmtT(r.best), 'arrêts', r.stops, r.out ?? '')
let failed = 0
const check = (name: string, ok: boolean, info = '') => { console.log(ok ? 'OK  ' : 'ECHEC', name, info); if (!ok) failed++ }
check('vingt voitures classées', rows.length >= 20, String(rows.length))
const timed = rows.filter(r => Number.isFinite(r.best) && r.best >= lapMin && r.best <= lapMax)
check('tours chronométrés plausibles', timed.length >= 12, `${timed.length}/${rows.length} entre ${lapMin} et ${lapMax} s`)
if (kind === 'race') {
  check('course terminée', sim.ctrl.phase === 'done', String(sim.ctrl.phase))
  check('le leader a fait ses tours', rows[0].laps >= laps, String(rows[0].laps))
  check('au moins 12 voitures à l\'arrivée', rows.filter(r => r.laps >= laps - 1 && !r.out).length >= 12, String(rows.filter(r => r.laps >= laps - 1 && !r.out).length))
}
try { mkdirSync(new URL('../../out/sessions/', import.meta.url), { recursive: true }); writeFileSync(new URL(`../../out/sessions/${kind}_${seed}.json`, import.meta.url), JSON.stringify({ kind, laps, seed, rows, log }, null, 1)) } catch { /* rapport facultatif */ }
process.exit(failed ? 1 : 0)
