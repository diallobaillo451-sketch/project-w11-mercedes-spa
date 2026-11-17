/** Point d'entrée : chargement, menus, boucle de jeu (physique 240 Hz → rendu interpolé → audio). */
import './ui/style.css'
import './ui/apple.css'
import * as THREE from 'three'
import { TrackSurface } from './track/surface.ts'
import { Barriers } from './track/barriers.ts'
import { Pitlane, type PitlaneData } from './track/pitlane.ts'
import { Game } from './core/game.ts'
import { CIRCUIT, grandPrixForTrack, isCircuitAvailable, selectCircuit, switchCircuit, trackForGrandPrix } from './core/circuit.ts'
import { Renderer } from './render/renderer.ts'
import { CAM_LABEL, CAM_ORDER, type CamMode } from './render/cameras.ts'
import { Input } from './controls/input.ts'
import { AudioEngine, type AudioFrame } from './audio/audio.ts'
import { MenuMusic } from './audio/menuMusic.ts'
import { AdaptiveResolution } from './quality/quality.ts'
import { loadSettings, saveSettings } from './ui/settings.ts'
import { aboutPanel, optionsPanel, setupPanel } from './ui/panels.ts'
import { Hud } from './ui/hud.ts'
import { WheelDisplay } from './ui/wheel.ts'
import { FLAG_LABEL } from './core/session.ts'
import { fmt } from './timing/timing.ts'
import { Radio } from './audio/radio.ts'
import { diag, dlog, derr, decideSafe, watchdog, bootDone, fatal, reloadSafe, gpuLost } from './diag.ts'
import { diagPanel } from './ui/diagPanel.ts'
import type { SessionKind } from './core/session.ts'
import { Menu } from './ui/menu.ts'
import { Garage, showResults } from './ui/garage.ts'
import { driverById, carOfTeam } from './data/drivers.ts'
import { applyCarPhysics, CARS2020 } from './physics/cars2020.ts'
import { Weekend, WK_LABEL, WK_SHORT, WK_ORDER, newTelemetry, sampleTelemetry, sessionKind, sessionMinutes, type SessionResult, type Telemetry, type WkSessionId, type WeekendPlan } from './core/weekend.ts'
import { fmtClock } from './ui/kit.ts'
import { FieldView } from './render/fieldView.ts'
import { marshalBoardFallbackAllowed, pitExitLampFallbackAllowed } from './render/signals.ts'
import { loadMonzaPits, loadSpaPits, monzaGarageAnimationState, openGarageDoors, updateGarageAnims } from './render/pitYard.ts'
import { readPitAnchors } from './render/anchors.ts'
import { PitScreens } from './render/pitScreens.ts'
import { Engineer } from './race/engineer.ts'
import { award, careerCalendar, loadCareer, newCareer, playerPos, rollEvents, rollWeather, saveCareer, simulateRound, Rng as CareerRng, type CareerState } from './core/career.ts'
import { Tower } from './ui/tower.ts'
import { Session } from './core/session.ts'
import { excludedFor, approxSession, startingGrid } from './core/quali.ts'
import { fmtT } from './race/control.ts'

const $ = (id: string) => document.getElementById(id)!
const show = (id: string, on: boolean) => { $(id).hidden = !on }
const settings = loadSettings()
document.title = 'PROJECT W11 — ' + CIRCUIT.name
const brandSub = document.getElementById('brandSub'); if (brandSub) brandSub.textContent = 'Mercedes-AMG F1 W11 EQ Performance · ' + CIRCUIT.name
let game: Game, ren: Renderer
const input = new Input(settings.input)
const audio = new AudioEngine()
const menuMusic = new MenuMusic()
const adapt = new AdaptiveResolution()
let hud: Hud
/** lot 8 C : plateau IA (rendu), tour de chronométrage, postes des commissaires (marshals.json de New Bot) */
let fview: FieldView | null = null, tower: Tower | null = null, marshals: unknown = null, ffPending = 0
let screens: PitScreens | null = null
let engineer: Engineer | null = null
let career: CareerState | null = null
let careerEvents: string[] = []
let careerFired = ''
const specTarget = new THREE.Object3D()
let wheel: WheelDisplay | null = null
const ws = { pitLim: false, ot: false, otT: 0, prevErs: 'hotlap' as string }
type Screen = 'boot' | 'menu' | 'drive' | 'pause' | 'garage' | 'results'
let screen: Screen = 'boot'
let mode: SessionKind | 'demo' = 'demo'
const params = new URLSearchParams(location.search)
decideSafe(params)

let lastLabel = ''
function bootProgress(label: string, f: number) {
  diag.lastProgress = performance.now(); if (label !== lastLabel) { lastLabel = label; dlog(label) }
  $('bootText').textContent = label + (diag.safe ? ' · mode sans échec' : ''); ($('bootBar') as HTMLElement).style.width = Math.round(f * 100) + '%' }

let pitData: PitlaneData | null = null
/** bouton Circuit (menu) : passe au prochain circuit assemblé, sans recharger la page */
function mountCircuitButton() {
  const b = document.createElement('button'); b.id = 'bCircuit'; b.type = 'button'; b.hidden = true
  b.textContent = 'Circuit : ' + CIRCUIT.name + ' ⇄'
  b.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);right:12px;z-index:60;padding:7px 12px;border:0;border-radius:999px;background:rgba(20,20,24,.62);color:#fff;font:600 12px -apple-system,system-ui,sans-serif;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)'
  b.addEventListener('click', () => { const next = switchCircuit(); if (next) void changeCircuit(next.id) })
  document.body.appendChild(b)
}
async function loadTrack(): Promise<TrackSurface> {
  bootProgress('Surface de piste…', 0.02)
  const [meta, bin, bar] = await Promise.all([fetch(CIRCUIT.trackDir + 'surface.json').then(r => r.json()), fetch(CIRCUIT.trackDir + 'surface.bin').then(r => r.arrayBuffer()),
    CIRCUIT.optionalAssets.barriers ? fetch(CIRCUIT.trackDir + 'barriers.bin').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null) : Promise.resolve(null)])
  const t = new TrackSurface(meta, new Uint16Array(bin)); if (bar) t.barriers = new Barriers(bar)
  pitData = CIRCUIT.optionalAssets.pitlane ? await fetch(CIRCUIT.trackDir + 'pitlane.json').then(r => r.ok ? r.json() : null).catch(() => null) : null
  return t
}
/** Installe les données d'une piste et ses ressources sur le renderer courant. */
async function mountCircuitScene(prog: (label: string, f: number) => void, suppliedTrack?: TrackSurface, rebuild = false) {
  if (rebuild) {
    if (screens) { screens.dispose(); screens = null }
    fview?.resetCircuit(); tower?.bind(null)
    if (ren.show.active) ren.exitShowroom()
    ren.clearCircuit()
  }
  const track = suppliedTrack ?? await loadTrack()
  game = new Game(track, 'timetrial')
  if (pitData) game.pit = new Pitlane(pitData, CIRCUIT.pit)
  game.autopilot = true; game.setWeather(settings.weather)
  const bindPit = (root: THREE.Object3D) => {
    if (!game.pit) return
    const a = readPitAnchors(root)
    if (game.adoptPitAnchors(a)) dlog('voie des stands : ancres du circuit (' + (game.pit.anchored ? 'chemin ' + game.pit.n + ' pts' : '') + ')')
    fview?.adoptScene(root); openGarageDoors(root, game.garage)
  }
  ren.onTile = root => bindPit(root)
  await ren.load(game, track, prog)
  void ren.streamTiles(game)
  fview ??= new FieldView(ren)
  if (ren.track) { bindPit(ren.track); fview.adoptScene(ren.track) }
  if (CIRCUIT.id === 'monza') await loadMonzaPits(game, ren, fview, driverById(settings.profile.driver).team).catch(e => dlog('stands Monza : ' + (e as Error).message))
  else if (CIRCUIT.spaPits) void loadSpaPits(game, ren, fview, carOfTeam(driverById(settings.profile.driver).team)).catch(e => dlog('stands : ' + (e as Error).message))
  screens = new PitScreens()
  if (CIRCUIT.id === 'monza') dlog('écrans garage Monza : ' + screens.bind(fview.anchors) + '/3 ancres 3D')
  engineer = new Engineer()
  marshals = CIRCUIT.marshals ? await fetch(CIRCUIT.marshals).then(r => r.ok ? r.json() : null).catch(() => null) : null
  prog('Plateau 2020…', 0.9)
  await fview.preload((done, total, team) => prog('Voitures · ' + team, 0.9 + 0.08 * done / Math.max(1, total)))
  if (rebuild) {
    applyCarPhysics(settings.profile.car)
    if (settings.profile.car !== ren.carId) await ren.setCar(settings.profile.car)
    applySettings(); wireRadio(); wheel = ren.rig ? new WheelDisplay(ren.rig.root) : null; syncWheelPad()
  }
}
let circuitChanging = false
function updateCircuitBrand() {
  document.title = 'PROJECT W11 — ' + CIRCUIT.name
  const sub = document.getElementById('brandSub'); if (sub) sub.textContent = 'Mercedes-AMG F1 W11 EQ Performance · ' + CIRCUIT.name
  const button = document.getElementById('bCircuit'); if (button) button.textContent = 'Circuit : ' + CIRCUIT.name + ' ⇄'
}
/** Change de circuit dans la session active, avec retour automatique à la piste précédente en cas d’échec. */
async function changeCircuit(id: string, gpId?: string): Promise<boolean> {
  if (circuitChanging) return false
  const oldId = CIRCUIT.id, oldGp = settings.profile.circuit
  const selected = selectCircuit(id)
  if (!selected) return false
  settings.profile.circuit = grandPrixForTrack(selected.id, gpId ?? oldGp); saveSettings(settings)
  if (selected.id === oldId) { updateCircuitBrand(); menu?.refresh(); return true }
  circuitChanging = true; run = null; game.autopilot = true
  setScreen('boot'); $('bootGo').hidden = true; bootProgress('Chargement de ' + selected.name + '…', 0)
  try {
    await mountCircuitScene(bootProgress, undefined, true)
    updateCircuitBrand(); ren.enterShowroom(); $('bootGo').hidden = false; setScreen('menu')
    return true
  } catch (e) {
    dlog('circuit ' + selected.id + ' : ' + (e as Error).message)
    const fallback = selectCircuit(oldId); settings.profile.circuit = oldGp; saveSettings(settings)
    if (fallback) try {
      await mountCircuitScene(bootProgress, undefined, true)
      updateCircuitBrand(); ren.enterShowroom(); $('bootGo').hidden = false; setScreen('menu')
      hud.toast('Circuit indisponible · retour à ' + fallback.name, 3600)
      return false
    } catch (restore) { dlog('restauration circuit : ' + (restore as Error).message) }
    $('bootGo').hidden = false; $('bootText').textContent = 'Erreur de chargement · ' + selected.name
    fatal((e as Error).message); return false
  } finally { circuitChanging = false }
}
let appliedTyres = '', lastPunct = '00000000'
function applySettings() {
  const prevC = game.car.setup.compound
  Object.assign(game.car.setup, settings.setup)
  // météo : la piste se mouille / s'assèche ; pneus : un changement de composé ou de couvertures monte un train neuf
  if (game.env.weather !== settings.weather) game.setWeather(settings.weather)
  const tk = settings.setup.compound + settings.blanketF + '/' + settings.blanketR
  if (tk !== appliedTyres || prevC !== settings.setup.compound) { appliedTyres = tk; game.car.fitTyres(settings.setup.compound, settings.blanketF, settings.blanketR) }
  game.car.damageMode = settings.damage
  game.car.ers.mode = settings.ersMode
  input.set = settings.input
  document.body.classList.toggle('gyro', settings.input.steerMode === 'gyro')
  document.body.classList.toggle('autogear', settings.setup.autoGear)
  show('bDas', settings.setup.dasEnabled)
  show('perf', settings.perf)
  adapt.enabled = settings.adaptive
  if (!settings.adaptive && adapt.step !== 0) { adapt.reset(); ren.setScale(1); ren.setFx(0) }
  audio.setVolume(settings.volume)
  radio.enabled = settings.radio; radio.setVolume(settings.radioVol)
  menuMusic.setEnabled(settings.music)
  menuMusic.setVolume(settings.musicVol)
  saveSettings(settings)
}
const CAM_SHORT: Record<CamMode, string> = { chase: 'Poursuite', close: 'Proche', tcam: 'T-cam', cockpit: 'Cockpit', tv: 'TV', free: 'Libre', garage: 'Garage' }
function setCam(m: CamMode) { ren.cams.setMode(m); $('bCam').textContent = CAM_SHORT[m]; $('bCam').title = CAM_LABEL[m] }
/** lot 8 C : plateau de 19 IA + direction de course pour la séance (course rapide, séances du week-end) */
function setupField(k: SessionKind | 'demo') {
  game.field = null; tower?.bind(null); show('bSkipF', false)
  if (!run || k === 'demo' || k === 'timetrial') { if (fview) fview.root.visible = false; return }
  const kind = k as SessionKind, player = settings.profile.driver
  let grid: string[] | undefined, exclude: string[] | undefined
  if (run.kind === 'weekend' && wk) {
    if (kind === 'race') { const g = startingGrid(wk, player); if (g.length) grid = g }
    if (run.id === 'Q2' || run.id === 'Q3') exclude = excludedFor(wk, run.id)
  }
  const F = game.startField({ kind, laps: run.laps, player, grid, exclude, sessionLen: kind === 'race' ? undefined : run.remaining, posts: marshals })
  F.difficulty = settings.profile.difficulty
  F.hybridOn = new URLSearchParams(location.search).get('hybrid') !== '0' // ?hybrid=0 : IA en 1D seule (comparer la fluidité)
  if (kind === 'race') F.planRace()
  if (kind === 'race') {
    F.ctrl.startFormation()
    // règle 2020 : le top 10 part avec les pneus du meilleur tour de Q2
    const q2t = wk?.result('Q2')?.q2tyre
    if (q2t && run.kind === 'weekend' && F.player.slot < 10) { settings.setup.compound = q2t as typeof settings.setup.compound; hud.toast('Top 10 : départ avec les pneus de Q2 (' + q2t + ')', 2600) }
  }
  tower?.bind(F)
  fview ??= new FieldView(ren); fview.root.visible = true
  const fv = fview
  const marshalPosts = (marshals as { posts?: unknown[] } | null)?.posts
  fv.setMarshalBoardFallback(marshalBoardFallbackAllowed(CIRCUIT.id, marshalPosts))
  const hasMeasuredPitExitLight = fv.anchors.has('anchor_pit_exit_light') || fv.anchors.has('pit_exit_light')
  fv.setPitExitLampFallback(pitExitLampFallbackAllowed(CIRCUIT.id, hasMeasuredPitExitLight))
  const pu = CARS2020[settings.profile.car]?.pu ?? 'mercedes'
  void audio.usePU(pu).catch(e => dlog('audio PU : ' + (e as Error).message))
  ren.releaseCarCache()
  void fv.load(F).then(async () => {
    if (CIRCUIT.spaPits && !fv.lamps.size) await fv.loadLamps('./assets/spa_pits/marshal_lamps.glb', F)
    screens?.bind(fv.anchors)
    ren.memLog('plateau IA chargé')
  }).catch(e => dlog('plateau IA : ' + (e as Error).message))
}
function skipFormation() { const F = game.field; if (!F) return; F.ctrl.skipFormation(); hud.toast('Tour de formation passé · tout le monde en grille', 2000) }
/** classement complet (plateau IA) pour l'écran de résultats */
function fieldTable(race: boolean) {
  const F = game.field!, C = F.ctrl, A = F.ordered()
  const extra = run ? game.penalties - run.pen0 : 0
  const tot = (x: typeof A[number]) => x.finished ? x.finishT - C.goT + x.pen + (x.player ? extra : 0) : null
  let rows = A.slice()
  if (race) { // temps de pénalité ajoutés au temps de course (art. 38.3) : reclassement des voitures dans le même tour
    rows.sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.laps - a.laps || ((tot(a) ?? 1e9) - (tot(b) ?? 1e9)) || b.dist - a.dist) }
  const t0 = race ? tot(rows[0]) : null
  return rows.map((x, k) => {
    const d = driverById(x.id), tt = tot(x)
    const time = x.out ? (x.out === 'Éliminé' ? '—' : x.out) : race ? (k === 0 && tt != null ? fmtT(tt) : x.laps < rows[0].laps ? `+${rows[0].laps - x.laps} tour${rows[0].laps - x.laps > 1 ? 's' : ''}` : tt != null && t0 != null ? '+' + (tt - t0).toFixed(3) + ' s' : '—') : fmtT(x.best)
    return { pos: x.out ? (x.out === 'Éliminé' ? x.pos : 'AB') : k + 1, code: x.code, name: d.last.toUpperCase(), team: x.team, time, laps: x.laps, me: x.player, pen: x.pen + x.penServed + (x.player ? extra : 0) }
  })
}
function startSession(k: SessionKind | 'demo', keepRun = false) {
  if (!keepRun) run = null
  mode = k
  game.autopilot = k === 'demo'
  game.start(k === 'demo' ? 'timetrial' : k)
  setupField(k)
  appliedTyres = ''
  game.paused = false
  applySettings()
  setScreen('drive')
  setCam(k === 'demo' ? 'tv' : settings.camera)
  // essais et qualifs : la voiture sort de son garage (caméra à l'intérieur), puis le joueur reprend la main dans la voie des stands
  if ((k === 'practice' || k === 'qualifying') && game.beginGarageExit()) setCam('garage')
  $('hSess').hidden = !run
  if (run) { game.car.fuel = run.fuel; run.started = true; run.goT = game.time; run.pen0 = game.penalties; run.tel = newTelemetry() }
  lapsDone = 0; if (k === 'timetrial') { radio.say('radio_check', 0); radio.say('tour_lance_go', 0) } else if (k === 'practice') { radio.say('radio_check', 0); radio.say('sortie_garage', 0) }
  if (k === 'race') { radio.say('radio_check', 0); hud.toast('Course · tour de formation terminé, place aux feux', 2600) }
  else if (k === 'qualifying') { radio.say('radio_check', 0); radio.say('sortie_garage', 0); hud.toast((run?.id ? WK_LABEL[run.id] : 'Qualifications') + ' · départ des stands') }
  else hud.toast(k === 'timetrial' ? 'Contre-la-montre · tour lancé' : k === 'practice' ? (run?.id ? WK_LABEL[run.id] : 'Essais libres') + ' · départ des stands' : 'Démo : pilote automatique')
}
function setScreen(s: Screen) {
  screen = s
  // écran Garage : le vrai garage 3D du joueur (voiture à sa place, caméra à l'intérieur) ; sans garage 3D, la vitrine studio
  const g3d = s === 'garage' && !!game?.garage
  const studio = s === 'menu' || s === 'results' || (s === 'garage' && !g3d)
  if (studio && !ren.show.active) ren.enterShowroom(); else if (!studio && s !== 'boot' && ren.show.active) ren.exitShowroom()
  if (g3d) { game.parkInGarage(); setCam('garage') }
  else if (s === 'drive' && ren.cams.mode === 'garage' && !game.garageExit) setCam(settings.camera)
  if (s !== 'boot') audio.setMuted(studio || g3d || settings.muted)
  const bc = document.getElementById('bCircuit'); if (bc) bc.hidden = s !== 'menu'
  menuMusic.setInMenu(s === 'menu') // musique : menu principal uniquement (ni garage, ni résultats, ni course)
  show('boot', s === 'boot'); show('menu', s === 'menu'); show('pause', s === 'pause'); show('garage', s === 'garage'); show('results', s === 'results')
  show('lights', s === 'drive' && !!run && run.kind !== 'legacy' && sessionKindOf(run) === 'race' && !run.lightsDone && (!game.field || game.field.ctrl.phase === 'lights'))
  const wkDrive = !!run && run.kind === 'weekend' && run.id !== 'RACE'
  show('pGarage', wkDrive); show('pRestart', !run || run.kind === 'quick'); $('pMenu').textContent = run?.kind === 'weekend' ? 'Quitter' : 'Menu'
  show('hud', s === 'drive' || s === 'pause')
  show('controls', s === 'drive' && !game?.autopilot)
  show('panel', false)
  if (s === 'menu') menu?.refresh()
  if (game) game.paused = s !== 'drive'
}
let panelBack: Screen = 'menu', panelQ = ''
function openPanel(which: 'setup' | 'options' | 'about' | 'diag') {
  panelBack = screen; panelQ = settings.quality
  $('panelTitle').textContent = which === 'setup' ? 'Réglages voiture' : which === 'options' ? 'Options' : which === 'diag' ? 'Diagnostic' : 'À propos'
  const body = $('panelBody')
  const prevQ = settings.quality
  if (which === 'setup') setupPanel(body, settings, applySettings)
  else if (which === 'options') optionsPanel(body, settings, () => {
    applySettings()
    if (settings.quality !== prevQ) hud.toast('Qualité appliquée au prochain chargement', 2600)
  }, {
    calibrate: () => { input.calibrate(); hud.toast('Gyroscope calibré') },
    enableGyro: async () => { const ok = await input.enableGyro(); if (!ok) hud.toast('Gyroscope refusé ou indisponible', 2600); return ok },
    diag: () => openPanel('diag'),
    gyroState: () => input.gyroOK ? 'Gyroscope autorisé' : input.gyroDenied ? 'Gyroscope refusé (Réglages Safari)' : 'Le gyroscope demandera une autorisation',
  })
  else if (which === 'diag') diagPanel(body, () => ren, () => adapt, reloadSafe)
  else aboutPanel(body)
  show('menu', false); show('pause', false); show('panel', true)
  if (game) game.paused = true
}
function closePanel() {
  show('panel', false)
  if (panelBack === 'menu') setScreen('menu'); else setScreen('pause')
  // rechargement seulement si la qualité a été CHANGÉE dans ce panneau (?q= de l'URL peut différer du réglage enregistré)
  if (panelQ && settings.quality !== panelQ) { saveSettings(settings); location.reload() }
}

function syncWheelPad() {
  const S = settings.setup, c = game.car
  $('wBB').textContent = (S.brakeBias * 100).toFixed(1).replace('.', ','); $('wDin').textContent = String(Math.round(S.diffOff * 10)); $('wDout').textContent = String(Math.round(S.diffOn * 10)); $('wTC').textContent = String(S.tc)
  $('wStrat').textContent = S.engineMode === 'quali' ? 'STRAT 1' : S.engineMode === 'race' ? 'STRAT 5' : 'STRAT 9'; $('wErs').textContent = 'ERS ' + ({ hotlap: 'HOT', balanced: 'BAL', charge: 'CHG', overtake: 'OT' } as Record<string, string>)[c.ers.mode]
  for (const [id, on] of [['wPit', ws.pitLim], ['wOt', ws.ot], ['bPit', ws.pitLim], ['bOt', ws.ot]] as [string, boolean][]) $(id).classList.toggle('on', on)
  $('bPit').classList.add('pit'); $('bOt').classList.add('ot')
}
function wireUi() {
  document.querySelectorAll<HTMLElement>('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act!
    if (a === 'timetrial' || a === 'practice' || a === 'demo') startSession(a)
    else if (a === 'garage') openGarage()
    else if (a === 'setup' || a === 'options' || a === 'about') openPanel(a)
    else if (a === 'resume') setScreen('drive')
    else if (a === 'restart') { if (run?.kind === 'quick') startQuick(); else startSession(mode) }
    else if (a === 'reset') { game.resetCar(); setScreen('drive') }
    else if (a === 'menu') { if (run?.kind === 'weekend') saveRun(); run = null; game.autopilot = true; setCam('tv'); menu.reset(); setScreen('menu') }
  }))
  $('panelClose').addEventListener('click', closePanel)
  $('bPause').addEventListener('click', () => setScreen(screen === 'pause' ? 'drive' : 'pause'))
  $('bCam').addEventListener('click', () => { const i = CAM_ORDER.indexOf(ren.cams.mode); const m = CAM_ORDER[(i + 1) % CAM_ORDER.length]; setCam(m); if (!game.autopilot) { settings.camera = m; saveSettings(settings) } })
  input.bindPedal($('pThrottle'), 'throttle'); input.bindPedal($('pBrake'), 'brake')
  input.bindSteerZone($('steerZone'), $('steerKnob'))
  input.bindTap($('bUp'), () => { input.st.shiftUp = true }); input.bindTap($('bDown'), () => { input.st.shiftDown = true })
  input.bindTap($('bDrs'), () => { input.st.drs = true })
  input.bindHold($('bDas'), v => { input.st.das = v })
  // ---- volant : boutons et rotatifs (reliés à la physique)
  const RADIO = ['Bono : « Rythme cible 1:41,5, pneus dans la fenêtre »', 'Bono : « Batterie OK pour le tour »', 'Bono : « Attention au vent dans Kemmel »', 'Bono : « Mode Strat 1 autorisé »', 'Bono : « Freins AV un peu chauds, BB +0,5 »', 'Bono : « Le gravier sort à Raidillon, reste propre »']
  const wAct = (a: string) => {
    const c = game.car, S = settings.setup, cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
    switch (a) {
      case 'bb-': S.brakeBias = cl(+(S.brakeBias - 0.005).toFixed(3), 0.5, 0.65); wheel?.say('BBAL ' + (S.brakeBias * 100).toFixed(1)); break
      case 'bb+': S.brakeBias = cl(+(S.brakeBias + 0.005).toFixed(3), 0.5, 0.65); wheel?.say('BBAL ' + (S.brakeBias * 100).toFixed(1)); break
      case 'din-': S.diffOff = cl(+(S.diffOff - 0.1).toFixed(2), 0, 1); wheel?.say('DIFF ENTRÉE ' + Math.round(S.diffOff * 10)); break
      case 'din+': S.diffOff = cl(+(S.diffOff + 0.1).toFixed(2), 0, 1); wheel?.say('DIFF ENTRÉE ' + Math.round(S.diffOff * 10)); break
      case 'dout-': S.diffOn = cl(+(S.diffOn - 0.1).toFixed(2), 0, 1); wheel?.say('DIFF SORTIE ' + Math.round(S.diffOn * 10)); break
      case 'dout+': S.diffOn = cl(+(S.diffOn + 0.1).toFixed(2), 0, 1); wheel?.say('DIFF SORTIE ' + Math.round(S.diffOn * 10)); break
      case 'tc-': S.tc = cl(S.tc - 1, 0, 2); wheel?.say('TC ' + S.tc); break
      case 'tc+': S.tc = cl(S.tc + 1, 0, 2); wheel?.say('TC ' + S.tc); break
      case 'strat': { const M = ['quali', 'race', 'save'] as const; S.engineMode = M[(M.indexOf(S.engineMode as typeof M[number]) + 1) % 3]; wheel?.say(S.engineMode === 'quali' ? 'STRAT 1 QUALI' : S.engineMode === 'race' ? 'STRAT 5 COURSE' : 'STRAT 9 ÉCO'); break }
      case 'ers': { const E = ['hotlap', 'balanced', 'charge'] as const; settings.ersMode = E[(E.indexOf(settings.ersMode as typeof E[number]) + 1) % 3]; if (!ws.ot) c.ers.mode = settings.ersMode; wheel?.say('ERS ' + settings.ersMode.toUpperCase()); break }
      case 'page': if (wheel) { wheel.page = (wheel.page + 1) % wheel.pages; wheel.say(['COURSE', 'PNEUS / FREINS', 'RÉGLAGES'][wheel.page], 1) } break
      case 'drs': input.st.drs = true; break
      case 'pit': ws.pitLim = !ws.pitLim; wheel?.say(ws.pitLim ? 'LIMITEUR 80 km/h' : 'LIMITEUR OFF'); audio.beep(ws.pitLim ? 1320 : 880); break
      case 'ot': ws.ot = !ws.ot; if (ws.ot) { ws.prevErs = settings.ersMode; c.ers.mode = 'overtake'; ws.otT = 8 } else c.ers.mode = settings.ersMode; wheel?.say(ws.ot ? 'OVERTAKE' : 'OT OFF'); break
      case 'n': if (c.speed < 2) { c.gear = 0; wheel?.say('NEUTRE') } else wheel?.say('N : à l’arrêt seulement'); break
      case 'radio': { const m = RADIO[Math.floor(Math.random() * RADIO.length)]; hud.toast(m, 3200); wheel?.say('RADIO'); audio.radio(); break }
      case 'ack': game.session.setFlag('none', 0); wheel?.say('OK'); break
    }
    applySettings(); syncWheelPad()
  }
  document.querySelectorAll<HTMLElement>('[data-w]').forEach(b => input.bindTap(b, () => wAct(b.dataset.w!)))
  input.bindTap($('bPit'), () => wAct('pit')); input.bindTap($('bOt'), () => wAct('ot'))
  $('bWheel').addEventListener('click', () => { const p = $('wheelPad'); p.hidden = !p.hidden; $('bWheel').classList.toggle('on', !p.hidden); syncWheelPad() })
  addEventListener('keydown', e => {
    if (screen === 'boot') return
    if (e.code === 'Escape' || e.code === 'KeyP') setScreen(screen === 'pause' ? 'drive' : screen === 'drive' ? 'pause' : screen)
    if (e.code === 'KeyC' && screen === 'drive') $('bCam').click()
    if (e.code === 'KeyR' && screen === 'drive') game.resetCar()
    if (e.code === 'KeyX') input.st.das = true
  })
  addEventListener('keyup', e => { if (e.code === 'KeyX') input.st.das = false })
  // caméra libre : glisser au centre de l'écran
  const cv = ren.canvas; let drag: { x: number; y: number } | null = null
  cv.addEventListener('pointerdown', e => { if (ren.cams.mode === 'free') drag = { x: e.clientX, y: e.clientY } })
  addEventListener('pointermove', e => { if (!drag) return; ren.cams.orbitYaw -= (e.clientX - drag.x) * 0.008; ren.cams.orbitPitch = THREE.MathUtils.clamp(ren.cams.orbitPitch + (e.clientY - drag.y) * 0.006, -0.05, 1.3); drag = { x: e.clientX, y: e.clientY } })
  addEventListener('pointerup', () => { drag = null })
  cv.addEventListener('wheel', e => { ren.cams.orbitDist = THREE.MathUtils.clamp(ren.cams.orbitDist * (1 + e.deltaY * 0.001), 3.5, 30) }, { passive: true })
  addEventListener('resize', () => ren.resize())
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { audio.suspend(); if (screen === 'drive') setScreen('pause') } else audio.resume()
  })
  // iOS : empêcher le zoom / défilement par geste
  document.addEventListener('gesturestart', e => e.preventDefault())
  document.addEventListener('touchmove', e => { if (!(e.target as HTMLElement).closest('#panelBody, .ap-page')) e.preventDefault() }, { passive: false })
  // vitrine 3D : glisser pour tourner autour de la voiture
  let sd: { x: number; y: number } | null = null
  document.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest?.('.ap-drag')) sd = { x: e.clientX, y: e.clientY } })
  addEventListener('pointermove', e => { if (!sd) return; ren.show.drag(e.clientX - sd.x, e.clientY - sd.y); sd = { x: e.clientX, y: e.clientY } })
  addEventListener('pointerup', () => { if (sd) ren.show.release(); sd = null }); addEventListener('pointercancel', () => { if (sd) ren.show.release(); sd = null })
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', e => ren.show.setTheme(e.matches))
}

// ---------- boucle
const camF = new THREE.Vector3(), camU = new THREE.Vector3(), carF = new THREE.Vector3()
const aFrame: AudioFrame = { rpm: 0, throttle: 0, speed: 0, slip: 0, kerb: 0, gravel: 0, scrape: 0, impact: 0, shift: 0, gear: 0, limiter: false, ers: 0, inside: false, pan: 0, dist: 1, radialV: 0,
  grass: 0, cam: 'chase', src: [0, 0, 0], fwd: [0, 0, -1], lis: [0, 0, 0], lisF: [0, 0, -1], lisU: [0, 1, 0] }
const rightV = new THREE.Vector3(), camPrev = new THREE.Vector3(), carW = new THREE.Vector3(), tmp = new THREE.Vector3()
let last = performance.now(), fpsAcc = 0, fpsN = 0, prevDist = 0
let skipAcc = 0
function frame(now: number) {
  requestAnimationFrame(frame)
  // 2K · 30 i/s : une image sur deux sur un écran 60 Hz (cadence régulière, sans à-coups)
  const fps30 = ren.q.fps <= 30 || adapt.lock30
  if (fps30 && !(window as unknown as { __w11?: { fixedDt?: number } }).__w11?.fixedDt) { skipAcc += now - last; if (skipAcc < 30) { last = now; return } }
  const dtMs = fps30 ? skipAcc + 0 : now - last; skipAcc = 0; last = now
  // tests : pas d'image imposé (rendu logiciel lent → simulation en temps « image par image »)
  const fixed = (window as unknown as { __w11?: { fixedDt?: number } }).__w11?.fixedDt
  const dt = fixed ?? Math.min(0.1, dtMs / 1000)
  menuMusic.update(dt)
  if (screen === 'boot') { if (ren.show.active) ren.showroomFrame(Math.min(dt, 0.05)); return }
  if (ren.show.active && (screen === 'menu' || screen === 'garage' || screen === 'results')) { ren.showroomFrame(Math.min(dt, 0.05)); garageTick(); if (screen === 'garage' && game.field && run?.started && !run.ended && game.field.kind !== 'race') game.field.update(dt); if (CIRCUIT.id === 'monza') { updateGarageAnims(dt, game.field?.player.pitPhase || game.pitCrewPhase, game.pitShow.lift); screens?.update(game.field, game.car, settings.weather) } return }
  updateGarageAnims(dt, game.field?.player.pitPhase || game.pitCrewPhase, CIRCUIT.id === 'monza' ? game.pitShow.lift : 0)
  if (screen === 'garage') { garageTick(); if (game.field && run?.started && !run.ended && game.field.kind !== 'race') game.field.update(dt) }
  const st = input.poll(dt, settings.setup.autoGear)
  const c = game.car
  game.ctl.throttle = st.throttle; game.ctl.brake = st.brake; game.ctl.steer = st.steer
  if (st.shiftUp) game.ctl.shiftUp = true
  if (st.shiftDown) game.ctl.shiftDown = true
  input.consumeShifts()
  if (st.drs || (settings.autoDrs && c.drsAvailable && st.brake < 0.05)) game.ctl.drs = true
  else game.ctl.drs = c.drsOpen // reste ouvert jusqu'au freinage (logique dans la physique)
  st.drs = false
  game.ctl.das = settings.setup.dasEnabled && st.das
  game.ctl.pitLim = ws.pitLim
  if (ws.ot) { ws.otT -= dt; if (ws.otT <= 0 || c.ers.soc < 0.3e6) { ws.ot = false; c.ers.mode = settings.ersMode; syncWheelPad() } }
  if (run && screen === 'drive') runPre(dt)
  game.advance(screen === 'drive' ? dt : 0)
  const ev = game.events
  if (ev.garageOut && !game.autopilot) setCam(settings.camera)
  if (run && screen === 'drive') runPost(dt)
  if (ev.lap) hud.toast((ev.lap.best ? 'Meilleur tour ! ' : 'Tour ') + fmt(ev.lap.time) + (ev.lap.valid ? '' : ' (invalide)'), 3200)
  else if (ev.invalid && !game.autopilot) hud.toast('Tour invalidé · limites de piste', 2000)
  else if (ev.reset) hud.toast('Remise en piste')
  if (ev.pitEntry && !game.autopilot) { hud.toast('Voie des stands · limiteur 80 km/h', 2400); wheel?.say('PIT LIMITER'); audio.beep(1320) }
  if (ev.pitExit && !game.autopilot) { hud.toast('Sortie des stands', 1800); wheel?.say('PIT EXIT'); audio.beep(880) }
  if (ev.repair) { hud.toast('Réparations effectuées au stand', 2400); wheel?.say('REPARE') }
  if (ev.pitSpeeding) { hud.toast(`Excès de vitesse dans les stands (${ev.pitSpeeding} km/h) · pénalité +5 s`, 3600); wheel?.say('PENALITE +5 s') }
  // tremblement caméra : vibreurs, herbe, gravier, chocs
  let kerb = 0, gravel = 0, slip = 0
  for (const w of c.wheels) { if (!w.contact) continue; if (w.type === 2) kerb += 0.25; if (w.type >= 4) gravel += 0.25; slip = Math.max(slip, Math.abs(w.slipVel ?? 0)) }
  const spd = c.speed
  const shake = Math.min(1, kerb * Math.min(1, spd / 30) * 0.8 + gravel * Math.min(1, spd / 20) + game.maxImpact * 0.3)
  ren.frame(game, dt, shake)
  if (CIRCUIT.id === 'monza') screens?.update(game.field, game.car, settings.weather)
  if (fview && game.field) fview.update(game.field, dt, ren.cams.cam)
  tower?.update(dt)
  // audio : position de la voiture relative à la caméra
  const cam = ren.cams.cam
  carW.copy(ren.car.position)
  const dist = cam.position.distanceTo(carW)
  const radialV = dt > 0 ? -(dist - prevDist) / dt : 0; prevDist = dist
  tmp.copy(carW).sub(cam.position).normalize()
  const right = rightV.set(1, 0, 0).applyQuaternion(cam.quaternion)
  const inside = ren.cams.mode === 'cockpit' || ren.cams.mode === 'tcam'
  let grassA = 0, gravelA = 0
  for (const w of c.wheels) { if (!w.contact) continue; if (w.type === 4) grassA += 0.25; else if (w.type === 5) gravelA += 0.25 }
  camF.set(0, 0, -1).applyQuaternion(cam.quaternion); camU.set(0, 1, 0).applyQuaternion(cam.quaternion); carF.set(0, 0, -1).applyQuaternion(ren.car.quaternion)
  aFrame.rpm = c.rpmVis; aFrame.throttle = c.throttleApplied ?? st.throttle; aFrame.speed = spd; aFrame.slip = slip; aFrame.kerb = kerb; aFrame.gravel = gravelA; aFrame.grass = grassA
  aFrame.scrape = game.maxScrape; aFrame.impact = game.maxImpact; if (c.hitKind) aFrame.hitKind = c.hitKind; aFrame.shift = game.shifts; aFrame.gear = c.gear; aFrame.limiter = c.limiter; aFrame.ers = (c.ers.kPower ?? 0) / 120_000
  aFrame.inside = inside; aFrame.pan = inside ? 0 : THREE.MathUtils.clamp(tmp.dot(right), -1, 1); aFrame.dist = inside ? 1 : dist; aFrame.radialV = inside ? 0 : radialV; aFrame.cam = ren.cams.mode === 'garage' ? 'chase' : ren.cams.mode
  aFrame.src![0] = carW.x; aFrame.src![1] = carW.y + 0.5; aFrame.src![2] = carW.z; aFrame.fwd![0] = carF.x; aFrame.fwd![1] = carF.y; aFrame.fwd![2] = carF.z
  aFrame.lis![0] = cam.position.x; aFrame.lis![1] = cam.position.y; aFrame.lis![2] = cam.position.z
  aFrame.lisF![0] = camF.x; aFrame.lisF![1] = camF.y; aFrame.lisF![2] = camF.z; aFrame.lisU![0] = camU.x; aFrame.lisU![1] = camU.y; aFrame.lisU![2] = camU.z
  { const e = game.env, cw = game.car.wheels; aFrame.rain = e.rainRate; aFrame.wet = e.water[e.idx(game.car.s, game.car.d)]
    aFrame.lock = game.car.brakeApplied > 0.1 && game.car.speed > 6 ? Math.max(0, ...cw.map(w => w.contact && Math.abs(w.omega * w.r) < game.car.speed * 0.5 ? 1 : 0)) : 0 }
  audio.update(aFrame, dt)
  if (game.field && screen === 'drive') {
    const near = game.field.cars.filter(r => game.field!.near.has(r.i) && !r.player).slice(0, 3).map(r => ({
      pu: CARS2020[r.car]?.pu ?? 'mercedes', rpm: 4200 + r.v * 68, x: r.wx, y: r.wy + 0.4, z: r.wz, throttle: Math.min(1, r.v / 70),
    }))
    void audio.updateNearby(near, [cam.position.x, cam.position.y, cam.position.z])
    const note = engineer?.tick(game.field, dt)
    if (note?.say) radio.say(note.say, note.critical ? 4 : 12)
    if (note?.text) { hud.toast(note.text, note.critical ? 4200 : 2800); if (!note.say) audio.radio() }
    screens?.update(game.field, c, game.env.weather)
    screens?.setDom((game.inPit || screen === 'drive' && c.speed < 1 && game.inPit) && (screens?.bound ?? 0) === 0)
    if (game.spectate && game.spectate !== 'tv' && fview) {
      const step = Math.floor(game.spectateT / 8)
      if (step !== Math.floor((game.spectateT - dt) / 8)) {
        const ids = game.field.ordered().filter(r => !r.player && !r.out).map(r => r.id)
        const i = Math.max(0, ids.indexOf(game.spectate))
        game.spectate = ids[(i + 1) % Math.max(1, ids.length)] ?? game.spectate
      }
      const v = fview.views.find(x => x.r.id === game.spectate)
      if (v) {
        specTarget.position.set(v.r.wx, v.r.wy, v.r.wz)
        if (v.r.q) specTarget.quaternion.set(v.r.q[0], v.r.q[1], v.r.q[2], v.r.q[3])
        else specTarget.rotation.set(0, Math.atan2(v.r.hx, -v.r.hz), 0)
        specTarget.updateMatrixWorld()
        ren.camFollow = specTarget
      }
      ren.car.visible = !game.spectateHide
    } else { ren.camFollow = null; if (!game.spectateHide) ren.car.visible = true }
    if (!careerFired && careerEvents.length && game.field.ctrl.phase === 'racing' && game.field.t > 55) {
      careerFired = '1'
      if (careerEvents.includes('safety car')) game.field.ctrl.scDeploy('débris en piste')
      else if (careerEvents.includes('virtual safety car')) game.field.ctrl.vscDeploy('voiture arrêtée')
      if (careerEvents.includes('averse') && !game.weatherTarget) game.weatherTarget = game.env.weather === 'dry' ? 'wet' : 'rain'
    }
  }
  radioTelemetry(dt)
  camPrev.copy(cam.position)
  hud.update(game)
  const ckMode = ren.cams.mode === 'cockpit'
  if (ckMode !== document.body.classList.contains('ck')) document.body.classList.toggle('ck', ckMode)
  wheel?.update(game, dt, ckMode || ren.cams.mode === 'free')
  const fl = game.session.flag, fe = $('hFlag')
  if (fe.dataset.f !== fl) { fe.dataset.f = fl; fe.hidden = fl === 'none' || fl === 'green' && game.autopilot; fe.className = 'flagban ' + fl; fe.textContent = FLAG_LABEL[fl] }
  const dl = game.session.timing.delta, de = $('hDelta'), dtxt = isNaN(dl) || game.autopilot ? '' : (dl >= 0 ? '+' : '−') + Math.abs(dl).toFixed(2)
  if (de.textContent !== dtxt) { de.textContent = dtxt; de.hidden = !dtxt || !fe.hidden; de.className = 'deltachip ' + (dl <= 0 ? 'neg' : 'pos') }
  if (settings.adaptive && adapt.sample(dtMs)) { if (ren.scale !== adapt.scale) ren.setScale(adapt.scale); ren.setFx(adapt.fx) }
  fpsAcc += dtMs; fpsN++
  if (fpsN >= 30) { diag.fps = 1000 * fpsN / fpsAcc; if (settings.perf) $('perf').textContent = `${(1000 * fpsN / fpsAcc).toFixed(0)} i/s · ${ren.r.info.render.calls} appels · éch. ${adapt.scale.toFixed(2)} · fx ${adapt.fx} · piste ${ren.tiles?.loaded.size ?? 0}/${ren.tiles?.total ?? 0}`; fpsAcc = 0; fpsN = 0 }
  const ka = $('steerKnob'); ka.style.setProperty('--s', String(st.steer))
}


// ---------- lot 7 : menu Apple, course rapide, week-end de GP (séances chronométrées, garage, résultats)
/** séance en cours : course rapide, séance d'un week-end, ou mode historique (contre-la-montre / essais / démo) */
interface Run { kind: 'quick' | 'weekend' | 'legacy'; id?: WkSessionId; laps: number; remaining: number; chequered: boolean; tel: Telemetry; lockPrev: boolean
  raceT: number; lightsT: number; lightsN: number; lightsHold: number; lightsDone: boolean; started: boolean; ended: boolean; ending?: boolean; lapsSeen?: number; lineSeen?: number; goT?: number; pen0: number; fuel: number }
let run: Run | null = null, menu!: Menu, garage: Garage | null = null, wk: Weekend | null = null
const sessionKindOf = (r: Run): SessionKind => r.kind === 'quick' ? 'race' : r.id ? sessionKind(r.id) : mode === 'demo' ? 'timetrial' : mode
const newRun = (kind: Run['kind'], laps: number, minutes: number, fuel: number): Run => ({ kind, laps, remaining: minutes * 60, chequered: false, tel: newTelemetry(), lockPrev: false,
  raceT: 0, lightsT: 0, lightsN: 0, lightsHold: 0.4 + Math.random() * 2.4, lightsDone: false, started: false, ended: false, pen0: 0, fuel })
const raceFuel = (laps: number) => Math.min(110, 2.45 * laps + 2) // E : ≈ 2,45 kg/tour à Spa (110 kg pour 44 tours)
function applyDriver(id: string) { const d = driverById(id); void ren.setDriver(id, d.team !== 'mercedes'); radio.driver = id }
async function startQuick() {
  const gp = settings.profile.circuit, track = trackForGrandPrix(gp)
  if (!track || !isCircuitAvailable(track)) { hud.toast('Cette piste n’est pas assemblée pour le moment', 3000); return }
  if (!await changeCircuit(track, gp)) return
  const P = settings.profile; run = newRun('quick', P.laps, 0, raceFuel(P.laps))
  settings.damage = settings.damage ?? 'real'; startSession('race', true); setScreen('drive')
}
async function startCareer() {
  const P = settings.profile
  career = career ?? loadCareer()
  if (!career || career.driver !== P.driver) career = newCareer(P.driver, P.difficulty)
  career.difficulty = P.difficulty
  const cal = careerCalendar()
  if (career.round >= cal.length) { hud.toast('Championnat terminé · P' + playerPos(career) + ' pilotes'); menu.refresh(); return }
  const c = cal[career.round]
  const rng = new CareerRng((career.seed + career.round * 17) >>> 0)
  const weather = rollWeather(c, rng)
  careerEvents = rollEvents(c, rng)
  careerFired = ''
  if (!c.available) {
    const rows = simulateRound(career, c)
    const me = rows.find(r => r.id === career!.driver)
    award(career, c.id, rows, { weather, simulated: true })
    saveCareer(career)
    hud.toast(`${c.gp} simulé (${weather}) · P${me?.pos ?? '—'} · championnat P${playerPos(career)}`, 4600)
    menu.refresh()
    return
  }
  const track = trackForGrandPrix(c.id)
  if (!track || !isCircuitAvailable(track) || !await changeCircuit(track, c.id)) { hud.toast('La piste de cette manche n’est pas disponible', 3000); return }
  settings.weather = weather
  settings.damage = 'real'
  game.setWeather(weather)
  game.weatherTarget = careerEvents.includes('averse') ? (weather === 'dry' || weather === 'damp' ? 'wet' : 'rain') : null
  const plan: WeekendPlan = {
    circuit: c.id, car: P.car, driver: P.driver, fpMin: [...P.fpMin] as [number, number, number], qMin: [...P.qMin] as [number, number, number],
    raceLaps: Math.min(c.laps, P.raceLaps), weather, damage: 'real', skip: P.shortWeekend ? ['FP1', 'FP2'] : [],
  }
  wk = Weekend.create(plan)
  hud.toast(`${c.gp} · ${weather}${c.night ? ' · nuit' : ''} · ${careerEvents.join(', ') || 'rien à signaler'}`, 4200)
  await startWeekend(false)
}
async function startWeekend(fresh: boolean) {
  const P = settings.profile
  if (fresh || !wk) {
    const plan: WeekendPlan = { circuit: P.circuit, car: P.car, driver: P.driver, fpMin: [...P.fpMin] as [number, number, number], qMin: [...P.qMin] as [number, number, number], raceLaps: P.raceLaps,
      weather: settings.weather, damage: settings.damage, skip: P.shortWeekend ? ['FP1', 'FP2'] : [] }
    wk = Weekend.create(plan); wk.st.fuel = 30
  }
  const gp = wk.st.plan.circuit, track = trackForGrandPrix(gp)
  if (!track || !isCircuitAvailable(track)) { hud.toast('La piste du week-end n’est pas assemblée', 3000); return }
  if (!await changeCircuit(track, gp)) return
  if (wk.st.plan.driver !== P.driver) { P.driver = wk.st.plan.driver; applyDriver(P.driver); saveSettings(settings) }
  settings.weather = wk.st.plan.weather as typeof settings.weather; settings.damage = wk.st.plan.damage
  newSessionRun(); if (wk.st.rem != null) run!.remaining = wk.st.rem
  openGarage()
}
async function startLegacyOnSelected(k: SessionKind | 'demo') {
  const gp = settings.profile.circuit, track = trackForGrandPrix(gp)
  if (!track || !isCircuitAvailable(track)) { hud.toast('Cette piste n’est pas assemblée pour le moment', 3000); return }
  if (await changeCircuit(track, gp)) startSession(k)
}
/** joueur éliminé en Q1 / Q2 : les séances suivantes sont simulées (résultats approchés), on passe directement à la suite */
function skipEliminated(): boolean {
  if (!wk) return false
  let skipped = false
  while (!wk.done && (wk.cur === 'Q2' || wk.cur === 'Q3') && excludedFor(wk, wk.cur).includes(wk.st.plan.driver)) {
    const id = wk.cur, cls = approxSession(excludedFor(wk, id), Date.now() & 0xffff)
    wk.finish({ id, best: null, sectors: null, bestSectors: [Infinity, Infinity, Infinity], laps: 0, valid: 0, vmax: 0, lapTimes: [], penalties: 0, pos: 0, cls, simulated: true }); skipped = true
  }
  return skipped
}
function newSessionRun() {
  if (skipEliminated()) hud.toast('Éliminé : la suite des qualifications est simulée', 2600)
  const id = wk!.cur, laps = id === 'RACE' ? wk!.st.plan.raceLaps : 0
  const prevTel = run?.tel
  run = newRun('weekend', laps, sessionMinutes(wk!.st.plan, id), id === 'RACE' ? raceFuel(laps) : id.startsWith('Q') ? 8 : wk!.st.fuel)
  run.id = id; if (prevTel) run.tel = prevTel // l'ingénieur s'appuie sur la séance précédente tant qu'on n'est pas ressorti
}
function saveRun() { if (wk && run?.kind === 'weekend') { wk.st.rem = run.remaining; wk.st.fuel = run.id && run.id.startsWith('FP') ? run.fuel : wk.st.fuel; wk.save() } }
function openGarage() {
  if (!wk || !run) return
  if (run.id === 'RACE') { // pas de garage pendant la course : préparation sur la grille puis départ
    if (!run.started) { garage = makeGarage(); setScreen('garage'); garage.open(); return }
  }
  game.paused = true; garage = makeGarage(); setScreen('garage'); garage.open(); saveRun()
}
function makeGarage() {
  return new Garage($('garage'), {
    wk: wk!, setup: settings.setup, weather: settings.weather,
    fuel: () => run!.fuel, setFuel: kg => { run!.fuel = kg; if (run!.id?.startsWith('FP')) wk!.st.fuel = kg; if (run!.started) game.car.fuel = kg },
    telemetry: () => run!.tel, laps: () => run!.started ? game.session.timing.laps : [], best: () => run!.started ? game.session.timing.best?.time ?? null : null,
    remaining: () => run!.remaining, spend: sec => { run!.remaining = Math.max(0, run!.remaining - sec); if (run!.started) ffPending += sec }, started: () => run!.started,
    goOut: () => {
      if (run!.id !== 'RACE' && run!.remaining <= 0) { endSession(); return }
      if (!run!.started) { startSession(sessionKind(run!.id!), true) } else { applySettings(); game.car.fitTyres(settings.setup.compound, settings.blanketF, settings.blanketR); setScreen('drive'); if (game.beginGarageExit()) setCam('garage') }
      run!.tel = newTelemetry(); saveRun()
    },
    endSession: () => endSession(), menu: () => { saveRun(); run = null; menu.reset(); setScreen('menu') }, save: () => { applySettings(); saveRun() },
    shot: s => ren.show.setShot(s), lift: on => { ren.show.lift = on ? 1 : 0 }, say: () => {},
  })
}
function garageTick() { if (screen === 'garage' && garage && Math.random() < 0.1) garage.tick()
  // travail des mécaniciens : le reste du plateau continue de rouler pendant ce temps (avance rapide par tranches de 10 s)
  if (ffPending > 0 && game.field) { const k = Math.min(10, ffPending); ffPending -= k; game.field.advance(k) } }
/** fin de séance : résultat enregistré, écran de résultats */
function endSession() {
  if (!run || run.ended) return
  run.ended = true
  const T = game.session.timing, laps = run.started ? T.laps : [], best = laps.filter(l => l.valid).reduce<number | null>((a, l) => a == null || l.time < a ? l.time : a, null)
  const pen = game.penalties - run.pen0
  const r: SessionResult = { id: run.id ?? 'RACE', best, sectors: T.best?.sectors ?? null, bestSectors: run.started ? [...T.bestSectors] : [Infinity, Infinity, Infinity], laps: laps.length, valid: laps.filter(l => l.valid).length,
    vmax: run.tel.vmax, lapTimes: laps.map(l => l.valid ? l.time : -l.time), penalties: pen, pos: 1 }
  if (sessionKindOf(run) === 'race') { r.total = laps.length >= run.laps ? T.lapStart - (run.goT ?? 0) + pen : undefined; r.dnf = laps.length < run.laps }
  let table: ReturnType<typeof fieldTable> | undefined
  const F = game.field
  if (F) {
    // qualif : on laisse le plateau finir ses tours lancés (avance rapide jusqu'au drapeau + 100 s)
    if (F.kind === 'qualifying') { let guard = 0; while (F.t < F.sessionLen + 100 && guard++ < 2000) F.advance(1) }
    const race = F.kind === 'race'
    table = fieldTable(race)
    const me = table.find(x => x.me)!; r.pos = typeof me.pos === 'number' ? me.pos : table.length
    if (race) { const p = F.player; r.dnf = !p.finished; r.total = p.finished ? p.finishT - F.ctrl.goT + p.pen + pen : undefined }
    r.cls = F.ordered().map(x => ({ id: x.id, best: isFinite(x.best) ? x.best : null, laps: x.laps, out: x.out === 'Éliminé' ? null : x.out, pen: x.pen }))
    if (run.id === 'Q2' || run.id === 'Q3' || run.id === 'Q1') r.cls = r.cls.filter(x => !(excludedFor(wk!, run!.id!).includes(x.id)))
    const gp: Record<string, number> = {}; for (const x of F.cars) if (x.gridPen) gp[x.id] = x.gridPen; r.gridPen = gp
    if (run.id === 'Q2') r.q2tyre = settings.setup.compound
  }
  game.paused = true; audio.setMuted(true)
  if (run.kind === 'quick') {
    showResults($('results'), { title: 'Course rapide', eyebrow: `Spa-Francorchamps · ${run.laps} tour${run.laps > 1 ? 's' : ''}`, r, driver: settings.profile.driver, race: true, table,
      actions: [{ label: 'Rejouer', on: () => startQuick() }, { label: 'Menu', sec: true, on: () => { run = null; menu.reset(); setScreen('menu') } }] })
  } else if (run.kind === 'weekend' && wk) {
    const id = run.id!; wk.finish(r); wk.st.rem = undefined; wk.save()
    const nx = wk.done ? null : wk.cur
    const out = id === 'Q1' ? r.pos > 15 : id === 'Q2' ? r.pos > 10 : false
    const note = id === 'Q1' || id === 'Q2' ? (out ? `Éliminé en ${id} (P${r.pos}) — tu pars ${r.pos}e sur la grille (hors pénalités).` : `Qualifié pour ${id === 'Q1' ? 'Q2 (15 premiers)' : 'Q3 (10 premiers)'} · P${r.pos}.`) + (id === 'Q2' && !out ? ' Règle 2020 : départ avec les pneus de ton meilleur tour de Q2.' : '')
      : id === 'Q3' ? (r.pos === 1 ? 'POLE POSITION !' : `P${r.pos} sur la grille (hors pénalités).`) : undefined
    showResults($('results'), { title: WK_LABEL[id], eyebrow: `Résultats · Grand Prix de Belgique`, r, driver: wk.st.plan.driver, race: id === 'RACE', note, table,
      summary: nx ? undefined : wk.st.results,
      actions: nx ? [{ label: `Continuer · ${WK_LABEL[nx]}`, on: () => { newSessionRun(); openGarage() } }, { label: 'Menu', sec: true, on: () => { run = null; menu.reset(); setScreen('menu') } }]
        : [{ label: 'Terminer le week-end', on: () => { Weekend.clear(); wk = null; run = null; menu.reset(); setScreen('menu') } }] })
  }
  setScreen('results'); ren.show.setShot('hero')
}
/** avant la physique : feux de départ (frein tenu jusqu'à l'extinction) */
function runPre(dt: number) {
  const r = run!
  const F = game.field
  if (sessionKindOf(r) === 'race' && !r.lightsDone && F) {
    const C = F.ctrl
    // joueur immobile au départ du tour de formation : le plateau ne peut pas le doubler → formation passée (E)
    if (C.phase === 'formation' && F.t > 12 && F.player.dist < (F.player as unknown as { _f0?: number })._f0! + 5) skipFormation()
    if (C.placePlayerRequest) { C.placePlayerRequest = false; const g = F.gridPos(F.player.slot); game.car.placeAt(g.s, g.d, 0); game.snapshot(); F.syncPlayer(game.car); C.jumpRef = { s: game.car.s, ok: C.phase === 'lights' } }
    show('bSkipF', C.phase === 'formation' || C.phase === 'gridding')
    $('lights').hidden = C.phase !== 'lights'
    if (C.phase === 'lights' && C.lightsN !== r.lightsN) { r.lightsN = C.lightsN; document.querySelectorAll('#lights i').forEach((e, i) => e.classList.toggle('on', i < C.lightsN)); if (C.lightsN > 0) audio.beep(660) }
    if (C.phase === 'racing') {
      r.lightsDone = true; document.querySelectorAll('#lights i').forEach(e => e.classList.remove('on')); $('lights').hidden = true; show('bSkipF', false); hud.toast('Extinction des feux !', 1600)
      r.raceT = 0; r.goT = game.time
      // chronométrage du joueur remis à zéro à l'extinction des feux (le tour de formation ne compte pas)
      const fl = game.session.flag; game.session = new Session(game.track.length, 'race'); game.session.setFlag(fl === 'none' ? 'green' : fl, 2)
    }
    return
  }
  if (sessionKindOf(r) === 'race' && !r.lightsDone) {
    r.lightsT += dt; const n = Math.min(5, Math.floor(r.lightsT))
    if (n !== r.lightsN) { r.lightsN = n; document.querySelectorAll('#lights i').forEach((e, i) => e.classList.toggle('on', i < n)); if (n > 0) audio.beep(660) }
    game.ctl.brake = 1
    if (r.lightsT >= 5 + r.lightsHold) { r.lightsDone = true; document.querySelectorAll('#lights i').forEach(e => e.classList.remove('on')); setTimeout(() => show('lights', false), 900); hud.toast('Extinction des feux !', 1600); r.raceT = 0; r.goT = game.time }
  }
}
/** après la physique : chrono de séance, drapeau à damier, télémétrie, arrêt au stand → garage */
function runPost(dt: number) {
  const r = run!, ev = game.events, c = game.car, k = sessionKindOf(r)
  if (r.ended) return
  const w = c.wheels
  const locking = c.brakeApplied > 0.1 && c.speed > 12 && w.some(x => x.contact && Math.abs(x.omega * x.r) < c.speed * 0.5)
  sampleTelemetry(r.tel, { speed: c.speed, tyreT: [w[0].tyre.temp, w[1].tyre.temp, w[2].tyre.temp, w[3].tyre.temp], brakeT: Math.max(...w.map(x => x.brakeT)), locking, scrape: game.maxScrape,
    alphaF: (w[0].alpha + w[1].alpha) / 2, alphaR: (w[2].alpha + w[3].alpha) / 2, steer: game.ctl.steer, dt }, r.lockPrev)
  r.lockPrev = locking
  const sc = $('hSess')
  if (k === 'race' && game.field) {
    const F = game.field, p = F.player
    if (r.lightsDone) r.raceT += dt
    const txt = !r.lightsDone ? 'Tour de formation' : `P${p.pos} · Tour ${Math.min(p.laps + 1, r.laps)}/${r.laps}`; if (sc.textContent !== txt) sc.textContent = txt; sc.hidden = false
    if (p.laps !== r.lapsSeen) { r.lapsSeen = p.laps; if (p.laps === r.laps - 1 && r.laps > 1 && !F.chequered) hud.toast('Dernier tour !', 2000) }
    if (F.chequered && !r.chequered && (p.finished || p.laps >= r.laps)) { r.chequered = true; game.session.setFlag('chequered', 999); hud.toast(`Drapeau à damier · P${p.pos}`, 3000); setTimeout(endSession, 2600) }
  } else if (k === 'race') {
    if (r.lightsDone) r.raceT += dt
    const done = game.session.timing.laps.length
    const txt = `Tour ${Math.min(done + 1, r.laps)}/${r.laps}`; if (sc.textContent !== txt) sc.textContent = txt; sc.hidden = false
    if (done !== r.lapsSeen) { r.lapsSeen = done; if (done === r.laps - 1 && r.laps > 1) hud.toast('Dernier tour !', 2000) }
    if (done >= r.laps && !r.chequered) { game.session.setFlag('chequered', 999); r.chequered = true; hud.toast('Drapeau à damier · P1', 3000); setTimeout(endSession, 2600) }
  } else if (r.kind === 'weekend') {
    r.remaining = Math.max(0, r.remaining - dt)
    const txt = `${WK_SHORT[r.id!]} · ${fmtClock(r.remaining)}`; if (sc.textContent !== txt) sc.textContent = txt; sc.hidden = false
    if (r.remaining <= 0 && !r.chequered) { r.chequered = true; game.session.setFlag('chequered', 999); radio.say('fin_session_rentre', 0); hud.toast('Drapeau à damier · termine ton tour', 3200) }
    // franchissement de la ligne (tour bouclé ou tour de sortie) après le damier, ou entrée aux stands → fin de séance
    const line = game.session.timing.laps.length + (game.session.timing.lapStart >= 0 ? 1 : 0)
    if (r.lineSeen == null || !r.chequered) r.lineSeen = line
    if (r.chequered && !r.ending && (line !== r.lineSeen || ev.pitEntry || game.inPit)) { r.ending = true; setTimeout(endSession, 1500) }
    if (ev.pitEntry && !r.chequered) hud.toast('Arrête-toi devant ton garage (2 s) pour voir l’ingénieur', 3000)
    if (ev.pitStop && !r.chequered && !r.ending) setTimeout(() => { if (screen === 'drive' && run === r) openGarage() }, 400)
  }
}
// ---------- radio de l'ingénieur : branchée sur le bus d'événements (src/core/events.ts) + télémétrie
const radio = new Radio()
let radioPoll = 0, lapsDone = 0
function wireRadio() {
  const b = game.bus, live = () => screen === 'drive' && !game.autopilot
  b.on('lap', e => { if (e.t !== 'lap' || !live()) return; lapsDone++
    if (!e.valid) { radio.say('tour_annule_limites', 5); return }
    if (e.best) { radio.say('meilleur_perso', 5); radio.sayClips(['seg_temps_au_tour', ...radio.timeClips(e.time)], 1, 'laptime') }
    else { radio.sayClips(['seg_temps_au_tour', ...radio.timeClips(e.time)], 1, 'laptime'); const dl = e.time - (game.storedBest ?? e.time); if (dl > 1.5) radio.say('pousser', 60); else if (dl < 0.6) radio.say('rythme_bon', 60) } })
  b.on('sector', e => { if (e.t !== 'sector' || !live() || e.n === 3) return; const dl = game.session.timing.delta
    if (!isNaN(dl) && dl < -0.15) radio.sayClips(['seg_secteur', 'num_' + e.n, 'seg_violet'], 1, 'sector')
    else if (!isNaN(dl) && dl > 0.6) radio.say('perte_temps_secteur', 90) })
  b.on('invalid', e => { if (e.t === 'invalid' && live()) radio.say('limites_piste', 15) })
  b.on('flag', e => { if (e.t !== 'flag' || !live()) return; const f = e.flag
    radio.say(f === 'yellow' ? 'drapeau_jaune' : f === 'double' ? 'double_jaune' : f === 'blackwhite' ? 'avertissement' : f === 'red' ? 'drapeau_rouge' : f === 'green' ? 'drapeau_vert' : '', 8) })
  b.on('impact', e => { if (e.t === 'impact' && live() && e.k > 0.6) radio.say('contact', 30) })
  b.on('damage', e => { if (e.t !== 'damage' || !live() || settings.damage === 'off') return; const d = game.car.damage
    radio.say(d.frontWing > 0.4 ? 'degats_aileron' : d.floor > 0.4 ? 'degats_fond' : 'degats_mineurs', 25) })
  b.on('pitEntry', () => { if (live()) radio.say('limiteur', 30) })
  b.on('pitExit', () => { if (live()) radio.say('sortie_stands', 30) })
  b.on('pitSpeeding', () => { if (live()) radio.say('exces_vitesse_stands', 30) })
  b.on('repair', () => { if (live()) radio.say('arret_ok', 30) })
  b.on('reset', () => { if (live()) radio.say('calme', 120) })
}
/** télémétrie lue toutes les 2 s : pneus hors fenêtre, freins, ERS vide, blocage de roue */
function radioTelemetry(dt: number) {
  { const c = game.car, k = c.wheels.map(w => w.tyre.puncture > 0 ? 1 : 0).join('') + c.damage.wheelOff.map(o => o ? 1 : 0).join('')
    if (k !== lastPunct) { const n = ['avant gauche', 'avant droite', 'arrière gauche', 'arrière droite']
      const i = c.wheels.findIndex((w, j) => w.tyre.puncture > 0 && lastPunct[j] !== '1'), j = c.damage.wheelOff.findIndex((o, q) => o && lastPunct[4 + q] !== '1')
      if (j >= 0) hud.toast('Roue arrachée · ' + n[j] + ' — rentre au stand'); else if (i >= 0) hud.toast('Crevaison · ' + n[i] + ' — rentre au stand')
      lastPunct = k } }
  radioPoll += dt; if (radioPoll < 2 || screen !== 'drive' || game.autopilot) return; radioPoll = 0
  const c = game.car, w = c.wheels, T = w.reduce((a, x) => a + x.tyre.temp, 0) / 4
  if (T > 118) radio.say('pneus_temp_haute', 120); else if (T < 62 && c.speed > 40 && lapsDone >= 1) radio.say('pneus_temp_basse', 120)
  if (w.some(x => x.brakeT > 1050)) radio.say('freins_temp', 120)
  if (c.ers.soc < 0.4e6 && c.speed > 50) radio.say('recharge_ers', 150)
  if (w.some(x => x.contact && x.omega * x.r < c.speed * 0.4 && c.speed > 25 && game.ctl.brake > 0.5)) radio.say('blocage', 45)
}

async function main() {
  watchdog(60, 300)
  dlog(`démarrage · ${navigator.userAgent} · écran ${innerWidth}×${innerHeight} @${devicePixelRatio}`)
  try {
    const track = await loadTrack()
    bootProgress('Trajectoire…', 0.05)
    await new Promise(r => setTimeout(r, 0))
    const QL = ['low', 'medium', 'high', 'ultra'] as const, q0 = (params.get('q') as typeof settings.quality) || settings.quality
    const qn = (params.has('q') ? q0 : QL[Math.max(0, QL.indexOf(q0 as typeof QL[number]) - diag.drop)]) as typeof settings.quality
    // KTX2 (textures compressées GPU) sur mobile, ou forcé par ?ktx=1 ; ?ktx=0 pour le désactiver
    const ktx = params.has('ktx') ? params.get('ktx') !== '0' : diag.mobile
    ren = new Renderer($('gl') as HTMLCanvasElement, qn, { safe: diag.safe, mobile: diag.mobile, ktx, onLost: () => gpuLost() })
    diag.preset = (diag.safe ? 'sans échec (' + ren.q.name + ')' : ren.q.name) + ' · DPR max ' + ren.q.dprMax + (ktx ? ' · KTX2' : ' · WebP')
    dlog('préréglage ' + diag.preset)
    await mountCircuitScene(bootProgress, track)
    career = loadCareer()
    hud = new Hud()
    tower = new Tower()
    $('bSkipF').addEventListener('click', () => skipFormation())
    void radio.load().then(() => dlog('radio : banque chargée')).catch(e => dlog('radio indisponible : ' + (e as Error).message))
    wireRadio()
    if (ren.rig) wheel = new WheelDisplay(ren.rig.root)
    applySettings()
    wireUi(); syncWheelPad()
    // menu Apple (vitrine 3D) : pilote choisi appliqué dès le démarrage
    if (settings.profile.driver !== 'ham') applyDriver(settings.profile.driver); else radio.driver = 'ham'
    // lot 8 : la voiture suit l'équipe du pilote ; le volant affiché (écran) est recréé à chaque changement de voiture
    ren.onCarChanged = () => { wheel = ren.rig ? new WheelDisplay(ren.rig.root) : null }
    settings.profile.car = carOfTeam(driverById(settings.profile.driver).team); saveSettings(settings)
    applyCarPhysics(settings.profile.car)
    if (settings.profile.car !== 'w11') void ren.setCar(settings.profile.car).catch(e => dlog('voiture ' + settings.profile.car + ' : ' + (e as Error).message))
    wk = Weekend.load()
    const S = settings
    menu = new Menu($('menu'), {
      profile: S.profile, get weather() { return S.weather }, set weather(v) { S.weather = v }, get damage() { return S.damage }, set damage(v) { S.damage = v },
      save: () => saveSettings(S), setDriver: id => applyDriver(id), setCar: id => { applyCarPhysics(id); void ren.setCar(id).catch(e => dlog('voiture ' + id + ' : ' + (e as Error).message)) }, shot: sh => ren.show.setShot(sh),
      selectCircuit: id => { const track = trackForGrandPrix(id); if (track) void changeCircuit(track, id) },
      startQuick: () => startQuick(), startWeekend: fresh => startWeekend(fresh),
      weekendInProgress: () => wk && !wk.done ? `${WK_SHORT[wk.cur]} · ${WK_LABEL[wk.cur]}` : null,
      startLegacy: k => startLegacyOnSelected(k), openPanel: w => openPanel(w), bestLap: () => game.storedBest,
      careerLabel: () => {
        const c = career ?? loadCareer(); if (!c) return null
        const cal = careerCalendar(); const gp = cal[Math.min(c.round, cal.length - 1)]
        return c.round >= cal.length ? `Terminé · P${playerPos(c)}` : `P${playerPos(c)} · ${gp?.gp ?? ''} (${c.round + 1}/${cal.length})`
      },
      startCareer: () => startCareer(),
    })
    setCam('tv')
    // mobile : départ sans GTAO et à 90 % de résolution ; l'adaptation remonte si l'iPhone tient 60 i/s
    adapt.baseMs = adapt.targetMs = 1000 / ren.q.fps
    // qualité réduite (mode sans échec / plantage antérieur) : TOUJOURS visible à l'écran, avec la raison
    if (diag.safe || diag.drop > 0) { const b = document.createElement('div'); b.className = 'qwarn'; b.textContent = 'Qualité réduite : ' + (diag.safeReason || 'plantage GPU précédent') + ' · Options → Diagnostic'; document.body.appendChild(b) }
    mountCircuitButton()
    bootProgress('Prêt', 1)
    bootDone()
    $('bootGo').hidden = false
    $('bootText').textContent = 'Prêt · mode paysage recommandé'
    const go = async () => {
      $('bootGo').removeEventListener('click', go)
      // dans le geste, SANS attendre : déverrouillage audio iOS puis autorisation gyroscope (les deux appels partent
      // synchrones dans le toucher). Le menu s'affiche tout de suite ; le son arrive quand il est décodé.
      dlog('toucher pour démarrer')
      void audio.init().then(() => { audio.setVolume(settings.volume); dlog('audio prêt'); if (audio.ctx && audio.radioIn) { radio.attach(audio.ctx, audio.radioIn); radio.setVolume(settings.radioVol) } }).catch(e => derr(e, 'audio'))
      menuMusic.arm()
      const gp = settings.input.steerMode === 'gyro' ? input.enableGyro() : null
      setScreen('menu')
      // iPhone : démarrage léger, puis montée en qualité si aucune perte de contexte après 12 s
      if (gp && !(await gp)) { settings.input.steerMode = 'touch'; applySettings() }
    }
    $('bootGo').addEventListener('click', go)
    last = performance.now(); requestAnimationFrame(frame)
    if (params.has('auto')) { await go(); const k = params.get('auto') as SessionKind | 'demo'; if (k) startSession(k) }
    ;(window as unknown as { __w11: unknown }).__w11 = { get game() { return game }, get ren() { return ren }, input, audio, settings, setCam, startSession, setScreen, openPanel, AudioEngine, get wheel() { return wheel }, get menu() { return menu }, startQuick, startWeekend, endSession, openGarage, changeCircuit, get circuitId() { return CIRCUIT.id }, monzaGarageAnimationState, updateGarageAnims, get run() { return run }, get wk() { return wk }, get fview() { return fview }, get tower() { return tower }, skipFormation, get screen() { return screen }, wAct: (a: string) => document.querySelector<HTMLElement>(`[data-w="${a}"]`)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) }
    ;(window as unknown as { __w11diag: unknown }).__w11diag = diag
  } catch (e) {
    console.error(e)
    $('bootText').textContent = 'Erreur de chargement : ' + (e as Error).message
    fatal('Le jeu n’a pas pu démarrer', (e as Error).message)
  }
  if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {})
}
void main()
