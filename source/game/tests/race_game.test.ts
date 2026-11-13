// Lot 8 C : Game + plateau IA (Node) — départ avec le joueur (pilote automatique), contacts, classement : npx tsx tests/race_game.test.ts [laps] [sec]
import { readFileSync } from 'node:fs'
import { TrackSurface } from '../src/track/surface.ts'
import { Barriers } from '../src/track/barriers.ts'
import { Pitlane } from '../src/track/pitlane.ts'
import { Game } from '../src/core/game.ts'
const rd = (f: string) => readFileSync(new URL('../public/track/' + f, import.meta.url))
const meta = JSON.parse(rd('surface.json').toString()), bin = rd('surface.bin'), bb = rd('barriers.bin')
const t = new TrackSurface(meta, new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2)); t.barriers = new Barriers(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength))
const g = new Game(t, 'race'); g.pit = new Pitlane(JSON.parse(rd('pitlane.json').toString()), { limitFromS: 6790, limitToS: 200 })
const laps = +(process.argv[2] ?? 3), SEC = +(process.argv[3] ?? 60)
g.start('race'); const F = g.startField({ kind: 'race', laps, player: process.env.P ?? 'ham', seed: 7, posts: JSON.parse(readFileSync(new URL('../public/assets/spa_pits/marshals.json', import.meta.url), 'utf8')) })
F.onMsg = m => console.log(m.t.toFixed(1), m.text)
F.ctrl.startFormation(); F.ctrl.skipFormation()
const p = F.player; let t0 = -1
for (let k = 0; k < 240 * (SEC + 20); k++) {
  if (F.ctrl.placePlayerRequest) { F.ctrl.placePlayerRequest = false; const gp = F.gridPos(p.slot); g.car.placeAt(gp.s, gp.d, 0); g.snapshot(); F.syncPlayer(g.car); F.ctrl.jumpRef = { s: g.car.s, ok: F.ctrl.phase === 'lights' } }
  g.autopilot = F.ctrl.phase === 'racing' || F.ctrl.phase === 'chequered'
  g.advance(1 / 240)
  if (F.ctrl.phase === 'racing' && t0 < 0) t0 = F.t
  if (t0 >= 0 && k % 240 === 0) console.log(`t+${(F.t - t0).toFixed(0)} joueur s ${p.s.toFixed(0)} d ${p.d.toFixed(1)} v ${(p.v * 3.6).toFixed(0)} P${p.pos} dmg ${g.car.damage.total.toFixed(2)} | ` + F.ordered().slice(0, 4).map(r => r.code + ' ' + r.s.toFixed(0) + '/' + r.d.toFixed(1)).join(' '))
  if (t0 >= 0 && F.t - t0 > SEC) break
  if (p.finished || p.out) break
}
console.log('résultat joueur', p.code, 'tours', p.laps, 'arrivé', p.finished, 'P' + p.pos, 'vitesse', (p.v * 3.6).toFixed(0), 'km/h', p.out ?? '')
