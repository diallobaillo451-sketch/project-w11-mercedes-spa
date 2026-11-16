// Evaluation des IA (CI, non bloquante) : plateau 100 % IA, TOUTES les IA en physique (AI_PHYS_MAX=20) ;
// le joueur est gare (immobile, marque 'out') dans la voie des stands.
// Scenarios : course (physique et 1D), safety car, drapeau rouge, drapeau jaune, qualif.
// node tests/ai_eval.test.ts [race|sc|red|yellow|quali|all]
import { readFileSync } from 'node:fs'
import { TrackSurface } from '../src/track/surface.ts'
import { Barriers } from '../src/track/barriers.ts'
import { Pitlane } from '../src/track/pitlane.ts'
import { Game } from '../src/core/game.ts'
import { profileLapTime } from '../src/track/racingLine.ts'

const rd = (f: string) => readFileSync(new URL('../public/track/' + f, import.meta.url))
const meta = JSON.parse(rd('surface.json').toString()), bin = rd('surface.bin'), bb = rd('barriers.bin')
const pitJson = JSON.parse(rd('pitlane.json').toString())
const R0 = Date.now()
const fmt = (t: number) => (!isFinite(t) || t <= 0 ? '    -    ' : Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0'))
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const head = (s: string) => { console.log(''); console.log('=== ' + s + '  [' + ((Date.now() - R0) / 1000).toFixed(0) + ' s reelles]') }
const pad = (x: unknown, n: number) => String(x).padStart(n)

function boot(kind: string, laps: number, sessionLen: number | undefined, seed: number, phys = true) {
  const t = new TrackSurface(meta, new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2))
  t.barriers = new Barriers(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength))
  const g: any = new Game(t, 'race')
  g.pit = new Pitlane(pitJson, { limitFromS: 6790, limitToS: 200 })
  g.start('race')
  const F: any = g.startField({ kind, laps, player: 'ham', seed, sessionLen })
  F.difficulty = 85; F.hybridOn = phys
  if (kind === 'race') F.planRace()
  // joueur gare, immobile, a mi-voie des stands : plateau 100 % IA
  const P = g.pit, k = Math.floor(P.n / 2), hx = P.x[k + 1] - P.x[k - 1], hz = P.z[k + 1] - P.z[k - 1], hl = Math.hypot(hx, hz) || 1
  g.car.placeAtXZ(P.x[k], P.z[k], hx / hl, hz / hl, 0)
  F.syncPlayer(g.car)
  F.player.out = 'gare (test)'; F.player.dist = -1e9
  return { g, F }
}
function hook(F: any) {
  const msgs: string[] = [], inc: Record<string, number> = { spin: 0, stuck: 0, wreck: 0 }
  F.onMsg = (m: any) => msgs.push(m.t.toFixed(0) + 's ' + m.text)
  const orig = F.physIncident.bind(F)
  F.physIncident = (r: any, kind: string, yaw: number) => {
    inc[kind]++
    if (inc.spin + inc.stuck + inc.wreck <= 30) console.log('  [accident physique] ' + kind + ' ' + r.code + ' (' + r.team + ') t=' + F.t.toFixed(0) + 's s=' + r.s.toFixed(0) + ' d=' + r.d.toFixed(1) + ' v=' + (r.v * 3.6).toFixed(0) + ' km/h mode=' + r.mode)
    orig(r, kind, yaw)
  }
  return { msgs, inc }
}
function toRacing(F: any) {
  F.ctrl.startFormation(); F.ctrl.skipFormation()
  for (let g = 0; F.ctrl.phase !== 'racing' && g < 60 * 240; g++) F.step(1 / 60)
}
/** avance de secs secondes de simulation ; cb est appelee chaque seconde, true = arreter */
function run(F: any, secs: number, cb?: (el: number) => boolean | void) {
  const n = Math.round(secs * 60)
  for (let k = 0; k < n; k++) { F.step(1 / 60); if (cb && k % 60 === 0 && cb(k / 60) === true) return k / 60 }
  return secs
}
const ratio = (r: any) => r.v / Math.max(1, r.prof.v[r.idx])
function digest(msgs: string[]) {
  const key = /t.te-.-queue|ACCIDENT|arr.t.e|SAFETY|VSC|ROUGE|not.|limites|.nalit.|contact|collision|rentre/i
  const sel = msgs.filter(m => key.test(m))
  console.log('messages de direction de course : ' + sel.length + ' / ' + msgs.length)
  for (const m of sel.slice(0, 45)) console.log('  ' + m)
}

function raceScenario(laps: number, phys: boolean) {
  head('COURSE ' + laps + ' tours, 19 IA, ' + (phys ? 'toutes en PHYSIQUE' : 'en 1D (hybride coupe)'))
  const { F } = boot('race', laps, undefined, 7, phys)
  const { msgs, inc } = hook(F)
  toRacing(F)
  const live = new Map<string, number>(), ph = new Map<string, number>(), rs = new Map<string, number>()
  const el = run(F, laps * 150 + 150, () => {
    let done = true
    for (const r of F.cars) {
      if (r.player) continue
      if (!r.out && !r.finished) done = false
      if (r.out || r.mode !== 'race') continue
      live.set(r.code, (live.get(r.code) ?? 0) + 1)
      if (F.drives(r)) { ph.set(r.code, (ph.get(r.code) ?? 0) + 1); rs.set(r.code, (rs.get(r.code) ?? 0) + ratio(r)) }
    }
    return done
  })
  console.log('duree simulee ' + el.toFixed(0) + ' s ; accidents physiques ' + JSON.stringify(inc))
  console.log('pos code team       tours  meilleur   moy(T2+)  arrets pen warn phys%  v/prof  fin')
  const ai = F.ordered().filter((r: any) => !r.player)
  for (const r of ai) {
    const lt = r.lapTimes.slice(1), lv = live.get(r.code) ?? 0, p = ph.get(r.code) ?? 0
    console.log(pad(r.pos, 3) + ' ' + r.code + '  ' + r.team.padEnd(11) + pad(r.laps, 4) + '   ' + fmt(r.best) + '  ' + fmt(mean(lt)) + '   ' + pad(r.stops, 4) + ' ' + pad(r.pen, 4) + ' ' + pad(r.warnings, 4) + ' ' + pad(lv ? Math.round(100 * p / lv) : 0, 5) + '  ' + (p ? ((rs.get(r.code) ?? 0) / p).toFixed(2) : ' - ') + '  ' + (r.out ?? (r.finished ? 'ok' : '')))
  }
  const teams = new Map<string, any[]>()
  for (const r of ai) { const a = teams.get(r.team) ?? []; a.push(r); teams.set(r.team, a) }
  console.log('equipe        cible(profil)  plafond phys.   reel moyen')
  for (const [team, rs2] of teams) { const r = rs2[0]; console.log(team.padEnd(13) + ' ' + fmt(r.prof.T).padStart(10) + '   ' + fmt(profileLapTime(r.prof.vPD, F.track.ds)).padStart(10) + '   ' + fmt(mean(rs2.flatMap((x: any) => x.lapTimes.slice(1)))).padStart(10)) }
  digest(msgs)
}

function scScenario() {
  head('SAFETY CAR (deployee 45 s apres le depart, course de 10 tours)')
  const { F } = boot('race', 10, undefined, 11)
  const { msgs, inc } = hook(F)
  toRacing(F); run(F, 45)
  const stops0 = new Map<string, number>(F.cars.map((r: any) => [r.code, r.stops]))
  const C = F.ctrl
  C.scDeploy('evaluation')
  const tDep = F.t
  let tOver = -1, tRestart = -1, viol = 0, worst = 0, worstWho = ''
  run(F, 480, (el: number) => {
    let maxN = 0, nPit = 0, nWant = 0, nUnl = 0
    for (const r of F.cars) {
      if (r.player || r.out || r.mode === 'dnf') continue
      if (r.mode === 'pit' || r.mode === 'redq') { nPit++; continue }
      if (r.wantPit) nWant++
      if (C.isUnlapping(r)) { nUnl++; continue }
      if (C.sc.active) { const q = ratio(r); if (q > maxN) maxN = q; if (q > worst) { worst = q; worstWho = r.code } if (q > 0.95) viol++ }
    }
    if (tOver < 0 && !C.sc.active) tOver = F.t - tDep
    if (tOver >= 0 && tRestart < 0 && !C.restartHold) tRestart = F.t - tDep
    if (Math.round(el) % 10 === 0) { const ld = F.leader(); console.log('  t+' + pad(Math.round(el), 3) + ' s SC ' + (C.sc.active ? C.sc.mode : 'rentree') + ' v=' + (C.sc.v * 3.6).toFixed(0) + ' km/h ecart chef-SC ' + (C.sc.active && ld ? F.road(ld.s, C.sc.s).toFixed(0) : '-') + ' m v/profil max ' + maxN.toFixed(2) + ' aux stands ' + nPit + ' veulent rentrer ' + nWant + ' dedoublent ' + nUnl + ' restartHold ' + C.restartHold) }
    return tRestart >= 0 && F.t - tDep > tRestart + 40
  })
  let stopped = 0; for (const r of F.cars) { if (!r.player && r.stops > (stops0.get(r.code) ?? 0)) stopped++ }
  console.log('SC rentree apres ' + tOver.toFixed(0) + ' s, reprise apres ' + tRestart.toFixed(0) + ' s ; pire v/profil sous SC ' + worst.toFixed(2) + ' (' + worstWho + ') ; echantillons > 0.95 : ' + viol + ' ; arrets sous SC : ' + stopped + ' ; accidents physiques ' + JSON.stringify(inc))
  digest(msgs)
}

function redScenario() {
  head('DRAPEAU ROUGE (45 s apres le depart, course de 10 tours)')
  const { F } = boot('race', 10, undefined, 13)
  const { msgs, inc } = hook(F)
  toRacing(F); run(F, 45)
  const C = F.ctrl
  const before = new Map<string, number>(F.cars.map((r: any) => [r.code, r.stops]))
  C.redFlag('evaluation')
  const tRed = F.t
  let resumed = -1
  run(F, 400, (el: number) => {
    if (Math.round(el) % 15 === 0) {
      const m: Record<string, number> = {}
      for (const r of F.cars) if (!r.player) m[r.mode] = (m[r.mode] ?? 0) + 1
      console.log('  t+' + pad(Math.round(el), 3) + ' s rouge=' + C.red + ' phase=' + C.phase + ' modes ' + JSON.stringify(m))
    }
    if (resumed < 0 && !C.red) resumed = F.t - tRed
    return resumed >= 0 && F.t - tRed > resumed + 60
  })
  let changed = 0
  for (const r of F.cars) { if (!r.player && r.stops > (before.get(r.code) ?? 0)) changed++ }
  console.log('reprise apres ' + resumed.toFixed(0) + ' s ; voitures ayant change de pneus pendant le rouge : ' + changed + ' / 19 ; accidents physiques ' + JSON.stringify(inc))
  console.log(F.ordered().filter((r: any) => !r.player).map((r: any) => r.code + ':' + r.tyre.c + (Math.round(r.tyre.age * 10) / 10) + (r.out ? '(out)' : '')).join(' '))
  digest(msgs)
}

function yellowScenario() {
  head('DRAPEAU JAUNE : la 6e voiture part en tete-a-queue a 40 s')
  const { F } = boot('race', 10, undefined, 5)
  const { msgs, inc } = hook(F)
  toRacing(F); run(F, 40)
  const C = F.ctrl
  const X = F.ordered().filter((r: any) => !r.player)[5]
  F.physIncident(X, 'spin', 0.5)
  console.log('  ' + X.code + ' a l arret en s=' + X.s.toFixed(0) + ' ; zone : ' + C.yellowAt(X.s))
  const low = new Map<string, number>()
  let drsInYellow = 0, fastNear = 0, samples = 0
  for (let k = 0; k < 60 * 40; k++) {
    F.step(1 / 60)
    for (const r of F.cars) {
      if (r.player || r === X || r.out || r.mode === 'pit' || r.mode === 'redq' || r.mode === 'dnf') continue
      if (!C.yellowAt(r.s)) continue
      samples++
      if (r.drs) drsInYellow++
      const d = F.road(r.s, X.s)
      if (d > -25 && d < 150 && (X.mode === 'spun' || X.mode === 'dnf') && r.v > 33) fastNear++
      low.set(r.code, Math.min(low.get(r.code) ?? 9, ratio(r)))
    }
  }
  const v = [...low.values()]
  console.log('voitures passees en zone jaune : ' + low.size + ' ; v/profil mini moyen ' + mean(v).toFixed(2) + ' (pire ' + Math.max(...v).toFixed(2) + ') ; echantillons en jaune ' + samples + ' dont DRS ouvert ' + drsInYellow + ' ; > 33 m/s a moins de 150 m de la voiture arretee : ' + fastNear + ' ; accidents physiques ' + JSON.stringify(inc))
  digest(msgs)
}

function qualiScenario() {
  head('QUALIF 10 min, 19 IA, toutes en PHYSIQUE')
  const { F } = boot('qualifying', 2, 600, 5)
  const { msgs, inc } = hook(F)
  run(F, 600 + 150, (el: number) => {
    if (Math.round(el) % 60 === 0) { const m: Record<string, number> = {}; for (const r of F.cars) if (!r.player) m[r.mode] = (m[r.mode] ?? 0) + 1; console.log('  t=' + pad(Math.round(el), 3) + ' s ' + JSON.stringify(m)) }
    return false
  })
  const ai = F.cars.filter((r: any) => !r.player).sort((a: any, b: any) => (a.best > 0 ? a.best : 1e9) - (b.best > 0 ? b.best : 1e9))
  console.log('rang code team       meilleur   tours  cible equipe')
  ai.forEach((r: any, i: number) => console.log(pad(i + 1, 4) + ' ' + r.code + '  ' + r.team.padEnd(11) + fmt(r.best) + '   ' + pad(r.lapTimes.length, 4) + '   ' + fmt(r.prof.T) + (r.out ? ' ' + r.out : '')))
  console.log('accidents physiques ' + JSON.stringify(inc) + ' ; pole IA ' + fmt(ai[0].best) + ' (record du jeu en reel : 1:41.252)')
  digest(msgs)
}

const which = process.argv[2] ?? 'all'
const jobs: [string, () => void][] = [
  ['race', () => { raceScenario(3, true); raceScenario(3, false) }],
  ['sc', scScenario], ['red', redScenario], ['yellow', yellowScenario], ['quali', qualiScenario],
]
for (const [n, f] of jobs) {
  if (which !== 'all' && which !== n) continue
  try { f() } catch (e) { console.log('ECHEC scenario ' + n + ' : ' + ((e as Error).stack ?? e)) }
}
console.log('')
console.log('fin apres ' + ((Date.now() - R0) / 1000).toFixed(0) + ' s')
