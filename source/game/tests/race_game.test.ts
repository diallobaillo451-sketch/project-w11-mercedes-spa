// Plateau IA + joueur (Node) : npx tsx tests/race_game.test.ts [laps] [sec]
// CIRCUIT_ID choisit la piste ; W11_PUBLIC_ASSETS peut pointer vers l’arbre statique gh-pages pour réutiliser ses assets.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

async function run() {
  const selectedId = process.env.CIRCUIT_ID ?? 'spa'
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search: `?circuit=${encodeURIComponent(selectedId)}`, href: `http://localhost/?circuit=${encodeURIComponent(selectedId)}` },
  })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {} } })
  const [{ CIRCUIT }, { TrackSurface }, { Barriers }, { Pitlane }, { Game }] = await Promise.all([
    import('../src/core/circuit.ts'), import('../src/track/surface.ts'), import('../src/track/barriers.ts'),
    import('../src/track/pitlane.ts'), import('../src/core/game.ts'),
  ])
  if (CIRCUIT.id !== selectedId) throw new Error(`Circuit demandé ${selectedId}, chargé ${CIRCUIT.id}`)

  const publicRoot = resolve(process.env.W11_PUBLIC_ASSETS ?? fileURLToPath(new URL('../public/', import.meta.url)))
  const stripPrefix = (path: string) => path.replace(/^\.\//, '')
  const trackRoot = join(publicRoot, stripPrefix(CIRCUIT.trackDir))
  const rd = (name: string) => readFileSync(join(trackRoot, name))
  const meta = JSON.parse(rd('surface.json').toString()), bin = rd('surface.bin')
  const t = new TrackSurface(meta, new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2))
  const barriersPath = join(trackRoot, 'barriers.bin')
  if (CIRCUIT.optionalAssets.barriers && existsSync(barriersPath)) {
    const bb = readFileSync(barriersPath)
    t.barriers = new Barriers(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength))
  }
  const g = new Game(t, 'race')
  const pitPath = join(trackRoot, 'pitlane.json')
  if (CIRCUIT.optionalAssets.pitlane && existsSync(pitPath)) g.pit = new Pitlane(JSON.parse(readFileSync(pitPath, 'utf8')), CIRCUIT.pit)
  const postsPath = CIRCUIT.marshals ? join(publicRoot, stripPrefix(CIRCUIT.marshals)) : null
  const posts = postsPath && existsSync(postsPath) ? JSON.parse(readFileSync(postsPath, 'utf8')) : undefined

  const laps = +(process.argv[2] ?? 3), SEC = +(process.argv[3] ?? 60)
  g.start('race')
  const F = g.startField({ kind: 'race', laps, player: process.env.P ?? 'ham', seed: 7, posts })
  F.onMsg = m => console.log(m.t.toFixed(1), m.text)
  F.ctrl.startFormation(); F.ctrl.skipFormation()
  if (process.env.HYBRID === '1') F.hybridOn = true // physique complète pour les IA proches du joueur, comme en jeu
  const p = F.player; let t0 = -1
  for (let k = 0; k < 240 * (SEC + 20); k++) {
    if (F.ctrl.placePlayerRequest) { F.ctrl.placePlayerRequest = false; const gp = F.gridPos(p.slot); g.car.placeAt(gp.s, gp.d, 0); g.snapshot(); F.syncPlayer(g.car); F.ctrl.jumpRef = { s: g.car.s, ok: F.ctrl.phase === 'lights' } }
    g.autopilot = F.ctrl.phase === 'racing'
    g.advance(1 / 240)
    if (F.ctrl.phase === 'racing' && t0 < 0) t0 = F.t
    if (t0 >= 0 && k % 240 === 0) console.log(`t+${(F.t - t0).toFixed(0)} ${CIRCUIT.id} tours ${p.laps} s ${p.s.toFixed(0)} d ${p.d.toFixed(1)} v ${(p.v * 3.6).toFixed(0)} P${p.pos} dmg ${g.car.damage.total.toFixed(2)} | ` + F.ordered().slice(0, 4).map(r => r.code + ' ' + r.s.toFixed(0) + '/' + r.d.toFixed(1)).join(' '))
    if (t0 >= 0 && F.t - t0 > SEC) break
  }
  if (F.cars.length !== 20) { console.error('ÉCHEC : plateau attendu 20 voitures, trouvé', F.cars.length); process.exitCode = 1 }
  for (const r of F.cars) {
    const state = [r.s, r.d, r.v, r.wx, r.wy, r.wz, r.hx, r.hz, r.nx, r.ny, r.nz, ...Object.values(r.dmg), ...(r.q ?? [])]
    if (!state.every(Number.isFinite)) { console.error('ÉCHEC : état non fini pour', r.code); process.exitCode = 1 }
  }
  if (!Number.isFinite(g.car.damage.total)) { console.error('ÉCHEC : dégâts joueur non finis'); process.exitCode = 1 }
  if (process.env.REQUIRE_LAP === '1' && F.player.laps < 1) { console.error(`ÉCHEC : aucun tour complet sur ${CIRCUIT.id} en ${SEC}s`); process.exitCode = 1 }
  console.log(`ok : ${CIRCUIT.name}, ${F.cars.length} voitures, ${F.player.laps} tour(s), HYBRID=${process.env.HYBRID === '1'}`)
}

void run().catch(error => { console.error(error); process.exitCode = 1 })
